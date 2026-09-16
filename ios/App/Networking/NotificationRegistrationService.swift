import BeanstalkCore
import Combine
import UIKit
import UserNotifications

@MainActor
final class NotificationRegistrationService: ObservableObject {
    @Published private(set) var authorizationStatus: UNAuthorizationStatus = .notDetermined
    @Published private(set) var statusMessage = "Alerts are not set up."
    @Published private(set) var isWorking = false
    @Published private(set) var alertsEnabled = false
    @Published private(set) var alertsAvailable = false
    @Published private(set) var hasStoredRegistration = false

    private let deviceAPI = DeviceAPI()
    private let isPushConfigured: () -> Bool
    private let operationQueue = SerializedAsyncQueue()
    private var currentTerms: [String] = []
    private var watchlistRevision: UInt64 = 0
    private var notificationIntentRevision: UInt64 = 0
    private var cancellables = Set<AnyCancellable>()

    init(isPushConfigured: @escaping () -> Bool = { AppConfiguration.isPushConfigured }) {
        self.isPushConfigured = isPushConfigured
        NotificationCenter.default.publisher(for: .didRegisterForRemoteNotifications)
            .compactMap { $0.userInfo?["deviceToken"] as? String }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] token in
                Task { await self?.registerOrRotate(token: token) }
            }
            .store(in: &cancellables)

        NotificationCenter.default.publisher(for: .remoteNotificationRegistrationFailed)
            .compactMap { $0.userInfo?["message"] as? String }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] message in
                guard let self else { return }
                if self.isPushConfigured() {
                    self.statusMessage = message
                } else {
                    self.applyUnavailableState()
                }
            }
            .store(in: &cancellables)

        Task { await refreshStatus() }
    }

    func requestAfterFirstWatchTerm(terms: [String]) async {
        _ = captureTerms(terms)
        guard isPushConfigured() else {
            applyUnavailableState()
            return
        }
        let requestIntentRevision = notificationIntentRevision
        isWorking = true
        defer { isWorking = false }
        do {
            let granted = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound])
            guard requestIntentRevision == notificationIntentRevision else { return }
            await refreshStatus()
            guard granted else {
                notificationIntentRevision &+= 1
                try? await deviceAPI.setAlertsEnabled(false)
                alertsEnabled = false
                UIApplication.shared.unregisterForRemoteNotifications()
                statusMessage = "Alerts are off. Your watchlist and recall browsing still work."
                return
            }
            try await deviceAPI.setAlertsEnabled(true)
            notificationIntentRevision &+= 1
            alertsEnabled = true
            statusMessage = "Waiting for this iPhone's notification token…"
            UIApplication.shared.registerForRemoteNotifications()
        } catch {
            statusMessage = AlertControlPolicy.enableFailedMessage
        }
    }

    func synchronize(terms: [String]) async {
        let snapshot = captureTerms(terms)
        guard isPushConfigured() else {
            applyUnavailableState()
            hasStoredRegistration = await deviceAPI.hasStoredRegistration()
            return
        }
        await refreshStatus()
        alertsEnabled = await deviceAPI.alertsEnabled()
        hasStoredRegistration = await deviceAPI.hasStoredRegistration()
        if !alertsEnabled {
            guard hasStoredRegistration else { return }
            let deletion = operationQueue.enqueue { [weak self] in
                await self?.performRegistrationDeletion()
            }
            await deletion.value
            return
        }
        guard AlertControlPolicy.shouldAttemptRegistration(
            alertsEnabled: alertsEnabled,
            alertsAvailable: isPushConfigured()
        ) else { return }
        guard authorizationStatus == .authorized || authorizationStatus == .provisional else { return }
        UIApplication.shared.registerForRemoteNotifications()
        if let token = await deviceAPI.storedToken() {
            await enqueueRegistration(
                token: token,
                terms: snapshot.terms,
                termsRevision: snapshot.revision,
                intentRevision: notificationIntentRevision
            )
        }
    }

    func syncWatchlist(terms: [String]) async {
        let snapshot = captureTerms(terms)
        let intentRevision = notificationIntentRevision
        alertsEnabled = await deviceAPI.alertsEnabled()
        guard AlertControlPolicy.shouldAttemptRegistration(
            alertsEnabled: alertsEnabled,
            alertsAvailable: isPushConfigured()
        ) else { return }
        guard authorizationStatus == .authorized || authorizationStatus == .provisional else { return }
        isWorking = true
        defer { isWorking = false }
        let operation = operationQueue.enqueue { [weak self] in
            await self?.performWatchlistSync(
                terms: snapshot.terms,
                termsRevision: snapshot.revision,
                intentRevision: intentRevision
            )
        }
        await operation.value
    }

    func disableAlerts() async {
        notificationIntentRevision &+= 1
        UIApplication.shared.unregisterForRemoteNotifications()
        isWorking = true
        defer { isWorking = false }
        let available = isPushConfigured()
        alertsAvailable = available

        do {
            try await deviceAPI.disableLocally()
        } catch {
            alertsEnabled = await deviceAPI.alertsEnabled()
            hasStoredRegistration = await deviceAPI.hasStoredRegistration()
            statusMessage = AlertControlPolicy.disableLocallyFailedMessage
            return
        }

        // Queue deletion before publishing the disabled state. This prevents a
        // rapid re-enable from placing its registration ahead of cleanup.
        let deletion = operationQueue.enqueue { [weak self] in
            await self?.performRegistrationDeletion()
        }
        alertsEnabled = false
        await deletion.value
        if !available {
            applyUnavailableState()
        }
    }

    func refreshStatus() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        authorizationStatus = settings.authorizationStatus
        alertsEnabled = await deviceAPI.alertsEnabled()
        hasStoredRegistration = await deviceAPI.hasStoredRegistration()
        guard isPushConfigured() else {
            applyUnavailableState()
            return
        }
        alertsAvailable = true
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            if !alertsEnabled {
                statusMessage = "Beanstalk alerts are not active. Recall browsing still works."
            } else if statusMessage == "Alerts are not set up." {
                statusMessage = "Alerts are allowed on this iPhone."
            }
        case .denied:
            statusMessage = "Alerts are disabled in iOS Settings. Recall browsing still works."
        case .notDetermined:
            statusMessage = "Add your first watch term to choose whether to allow alerts."
        @unknown default:
            statusMessage = "Notification permission status is unavailable."
        }
    }

    private func registerOrRotate(token: String) async {
        let snapshot = captureTerms(currentTerms)
        await enqueueRegistration(
            token: token,
            terms: snapshot.terms,
            termsRevision: snapshot.revision,
            intentRevision: notificationIntentRevision
        )
    }

    private func enqueueRegistration(
        token: String,
        terms: [String],
        termsRevision: UInt64,
        intentRevision: UInt64
    ) async {
        isWorking = true
        defer { isWorking = false }
        let operation = operationQueue.enqueue { [weak self] in
            await self?.performRegistration(
                token: token,
                terms: terms,
                termsRevision: termsRevision,
                intentRevision: intentRevision
            )
        }
        await operation.value
    }

    private func performRegistration(
        token: String,
        terms: [String],
        termsRevision: UInt64,
        intentRevision: UInt64
    ) async {
        let enabledBeforeRequest = await deviceAPI.alertsEnabled()
        guard termsRevision == watchlistRevision,
              intentRevision == notificationIntentRevision,
              AlertControlPolicy.shouldAttemptRegistration(
                  alertsEnabled: enabledBeforeRequest,
                  alertsAvailable: isPushConfigured()
              ) else { return }
        do {
            try await deviceAPI.registerOrRotate(
                token: token,
                environment: AppConfiguration.apnsEnvironment,
                terms: terms
            )
            let enabledAfterRequest = await deviceAPI.alertsEnabled()
            guard intentRevision == notificationIntentRevision,
                  AlertControlPolicy.shouldAttemptRegistration(
                      alertsEnabled: enabledAfterRequest,
                      alertsAvailable: isPushConfigured()
                  ) else {
                UIApplication.shared.unregisterForRemoteNotifications()
                await performRegistrationDeletion()
                return
            }
            hasStoredRegistration = true
            if termsRevision == watchlistRevision {
                statusMessage = activeStatus(for: terms)
            }
        } catch {
            let stillEnabled = await deviceAPI.alertsEnabled()
            if intentRevision != notificationIntentRevision || !stillEnabled {
                UIApplication.shared.unregisterForRemoteNotifications()
                await performRegistrationDeletion()
            } else {
                statusMessage = AlertControlPolicy.enableFailedMessage
            }
        }
    }

    private func performWatchlistSync(
        terms: [String],
        termsRevision: UInt64,
        intentRevision: UInt64
    ) async {
        let enabled = await deviceAPI.alertsEnabled()
        guard termsRevision == watchlistRevision,
              intentRevision == notificationIntentRevision,
              AlertControlPolicy.shouldAttemptRegistration(
                  alertsEnabled: enabled,
                  alertsAvailable: isPushConfigured()
              ) else { return }
        do {
            try await deviceAPI.syncWatchlist(terms)
            let stillEnabled = await deviceAPI.alertsEnabled()
            guard termsRevision == watchlistRevision,
                  intentRevision == notificationIntentRevision,
                  stillEnabled else { return }
            statusMessage = activeStatus(for: terms)
        } catch DeviceAPIError.unauthorized {
            guard termsRevision == watchlistRevision,
                  intentRevision == notificationIntentRevision,
                  await deviceAPI.alertsEnabled() else { return }
            if let token = await deviceAPI.storedToken() {
                await performRegistration(
                    token: token,
                    terms: terms,
                    termsRevision: termsRevision,
                    intentRevision: intentRevision
                )
            } else {
                statusMessage = "The saved registration expired. Waiting for a new notification token…"
                UIApplication.shared.registerForRemoteNotifications()
            }
        } catch {
            guard termsRevision == watchlistRevision,
                  intentRevision == notificationIntentRevision else { return }
            statusMessage = AlertControlPolicy.watchlistSyncFailedMessage
        }
    }

    private func performRegistrationDeletion() async {
        do {
            let result = try await deviceAPI.deleteRegistration()
            switch result {
            case .deleted:
                statusMessage = "Beanstalk's server registration was removed."
            case .noStoredRegistration:
                statusMessage = "No Beanstalk server registration was stored on this iPhone."
            case .credentialsExpired:
                statusMessage = "The saved server credentials had expired. Local alert registration was cleared."
            }
        } catch {
            statusMessage = AlertControlPolicy.serverDeletionFailedMessage
        }
        alertsEnabled = await deviceAPI.alertsEnabled()
        hasStoredRegistration = await deviceAPI.hasStoredRegistration()
    }

    private func applyUnavailableState() {
        alertsAvailable = false
        alertsEnabled = false
        isWorking = false
        statusMessage = AlertControlPolicy.unavailableMessage
    }

    private func captureTerms(_ terms: [String]) -> (terms: [String], revision: UInt64) {
        let normalizedTerms = normalized(terms)
        if normalizedTerms != currentTerms {
            currentTerms = normalizedTerms
            watchlistRevision &+= 1
        }
        return (currentTerms, watchlistRevision)
    }

    private func activeStatus(for terms: [String]) -> String {
        "Alerts are active for \(terms.count) watch term\(terms.count == 1 ? "" : "s")."
    }

    private func normalized(_ terms: [String]) -> [String] {
        Array(Set(terms.map(WatchMatcher.normalizeTerm).filter { !$0.isEmpty })).sorted()
    }
}
