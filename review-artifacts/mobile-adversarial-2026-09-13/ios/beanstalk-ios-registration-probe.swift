
import Foundation
import Combine

enum UNAuthorizationStatus: Sendable { case notDetermined, authorized, provisional, ephemeral, denied }
struct UNNotificationSettings: Sendable { let authorizationStatus: UNAuthorizationStatus }
struct UNAuthorizationOptions: OptionSet, Sendable {
 let rawValue: Int
 static let alert = Self(rawValue: 1)
 static let badge = Self(rawValue: 2)
 static let sound = Self(rawValue: 4)
}
@MainActor final class UNUserNotificationCenter {
 static let instance = UNUserNotificationCenter()
 static func current() -> UNUserNotificationCenter { instance }
 var authorizationWaiter: CheckedContinuation<Bool, Never>?
 func requestAuthorization(options: UNAuthorizationOptions) async throws -> Bool {
   await withCheckedContinuation { authorizationWaiter = $0 }
 }
 func notificationSettings() async -> UNNotificationSettings { UNNotificationSettings(authorizationStatus: .authorized) }
}
@MainActor final class UIApplication {
 static let shared = UIApplication()
 var registered = 0
 var unregistered = 0
 func registerForRemoteNotifications() { registered += 1 }
 func unregisterForRemoteNotifications() { unregistered += 1 }
}
enum AppConfiguration { static let apnsEnvironment = "sandbox" }
enum DeviceAPIError: Error { case unauthorized }
enum DeviceDeletionResult { case deleted, noStoredRegistration, credentialsExpired }
actor DeviceAPI {
 static let shared = DeviceAPI()
 var enabled = false
 var credentials = true
 var token: String? = "old"
 var deletions = 0
 var failDeletion = true
 func storedToken() -> String? { token }
 func alertsEnabled() -> Bool { enabled }
 func hasStoredRegistration() -> Bool { credentials }
 func setAlertsEnabled(_ value: Bool) throws { enabled = value }
 func disableLocally() throws { enabled = false; token = nil }
 func registerOrRotate(token: String, environment: String, terms: [String]) async throws { self.token = token; credentials = true }
 func syncWatchlist(_ terms: [String]) async throws {}
 func deleteRegistration() async throws -> DeviceDeletionResult {
   deletions += 1
   if failDeletion { throw URLError(.notConnectedToInternet) }
   credentials = false
   return .deleted
 }
 func recoverNetwork() { failDeletion = false }
}
import Foundation

/// Runs asynchronous operations in the order they were enqueued. Enqueueing is
/// synchronous, so callers can establish ordering before their next suspension.
public final class SerializedAsyncQueue: @unchecked Sendable {
    private let lock = NSLock()
    private var tail: Task<Void, Never>?

    public init() {}

    @discardableResult
    public func enqueue(_ operation: @escaping @Sendable () async -> Void) -> Task<Void, Never> {
        lock.lock()
        defer { lock.unlock() }
        let predecessor = tail
        let current = Task {
            if let predecessor {
                await predecessor.value
            }
            await operation()
        }
        tail = current
        return current
    }
}
import Foundation

public struct WatchField: Codable, Hashable, Sendable {
    public let name: String
    public let text: String

    public init(name: String, text: String) {
        self.name = name
        self.text = text
    }
}

public struct WatchMatch: Codable, Hashable, Identifiable, Sendable {
    public var id: String { "\(term)|\(field)|\(evidence)" }
    public let term: String
    public let field: String
    public let evidence: String

    public init(term: String, field: String, evidence: String) {
        self.term = term
        self.field = field
        self.evidence = evidence
    }
}

public enum WatchMatcher {
    public static func normalizeTerm(_ term: String) -> String {
        term.precomposedStringWithCompatibilityMapping
            .lowercased(with: Locale(identifier: "en_US_POSIX"))
            .split(whereSeparator: { $0.isWhitespace })
            .joined(separator: " ")
    }

    public static func contains(term rawTerm: String, in text: String) -> Bool {
        let term = normalizeTerm(rawTerm)
        guard !term.isEmpty, !text.isEmpty else { return false }
        let normalizedText = text.precomposedStringWithCompatibilityMapping
            .lowercased(with: Locale(identifier: "en_US_POSIX"))
        let escaped = NSRegularExpression.escapedPattern(for: term)
        let pattern = "(?<![\\p{L}\\p{N}\\p{M}])\(escaped)(?![\\p{L}\\p{N}\\p{M}])"
        guard let expression = try? NSRegularExpression(
            pattern: pattern,
            options: [.caseInsensitive, .useUnicodeWordBoundaries]
        ) else { return false }
        let range = NSRange(normalizedText.startIndex..<normalizedText.endIndex, in: normalizedText)
        return expression.firstMatch(in: normalizedText, range: range) != nil
    }

    public static func matches(terms: [String], fields: [WatchField]) -> [WatchMatch] {
        var results: [WatchMatch] = []
        for rawTerm in terms {
            let term = normalizeTerm(rawTerm)
            guard !term.isEmpty else { continue }
            for field in fields where contains(term: term, in: field.text) {
                results.append(WatchMatch(term: term, field: field.name, evidence: field.text))
            }
        }
        return results
    }
}
import Foundation

public enum AlertSettingsAction: Equatable, Sendable {
    case turnOn
    case turnOff
    case none
}

public enum AlertControlPolicy {
    /// Local user intent controls the Settings action. A pending or failed
    /// backend registration must never hide the ability to turn alerts off.
    public static func settingsAction(
        alertsEnabled: Bool,
        hasBackendRegistration: Bool,
        watchTermCount: Int
    ) -> AlertSettingsAction {
        if alertsEnabled { return .turnOff }
        if watchTermCount > 0 { return .turnOn }
        return .none
    }

    public static func shouldAttemptRegistration(alertsEnabled: Bool) -> Bool {
        alertsEnabled
    }
}
import Combine

@MainActor
final class NotificationRegistrationService: ObservableObject {
    @Published private(set) var authorizationStatus: UNAuthorizationStatus = .notDetermined
    @Published private(set) var statusMessage = "Alerts are not set up."
    @Published private(set) var isWorking = false
    @Published private(set) var alertsEnabled = false
    @Published private(set) var hasStoredRegistration = false

    private let deviceAPI = DeviceAPI.shared
    private let operationQueue = SerializedAsyncQueue()
    private var currentTerms: [String] = []
    private var watchlistRevision: UInt64 = 0
    private var notificationIntentRevision: UInt64 = 0
    private var cancellables = Set<AnyCancellable>()

    init() {}

    func requestAfterFirstWatchTerm(terms: [String]) async {
        _ = captureTerms(terms)
        isWorking = true
        defer { isWorking = false }
        do {
            let granted = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound])
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
            statusMessage = "Could not request alerts: \(error.localizedDescription)"
        }
    }

    func synchronize(terms: [String]) async {
        let snapshot = captureTerms(terms)
        await refreshStatus()
        alertsEnabled = await deviceAPI.alertsEnabled()
        hasStoredRegistration = await deviceAPI.hasStoredRegistration()
        guard AlertControlPolicy.shouldAttemptRegistration(alertsEnabled: alertsEnabled) else { return }
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
        guard AlertControlPolicy.shouldAttemptRegistration(alertsEnabled: alertsEnabled) else { return }
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

        do {
            try await deviceAPI.disableLocally()
        } catch {
            alertsEnabled = await deviceAPI.alertsEnabled()
            hasStoredRegistration = await deviceAPI.hasStoredRegistration()
            statusMessage = "Could not save the alert opt-out on this iPhone: \(error.localizedDescription)"
            return
        }

        // Queue deletion before publishing the disabled state. This prevents a
        // rapid re-enable from placing its registration ahead of cleanup.
        let deletion = operationQueue.enqueue { [weak self] in
            await self?.performRegistrationDeletion()
        }
        alertsEnabled = false
        await deletion.value
    }

    func refreshStatus() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        authorizationStatus = settings.authorizationStatus
        alertsEnabled = await deviceAPI.alertsEnabled()
        hasStoredRegistration = await deviceAPI.hasStoredRegistration()
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
              AlertControlPolicy.shouldAttemptRegistration(alertsEnabled: enabledBeforeRequest) else { return }
        do {
            try await deviceAPI.registerOrRotate(
                token: token,
                environment: AppConfiguration.apnsEnvironment,
                terms: terms
            )
            let enabledAfterRequest = await deviceAPI.alertsEnabled()
            guard intentRevision == notificationIntentRevision,
                  AlertControlPolicy.shouldAttemptRegistration(alertsEnabled: enabledAfterRequest) else {
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
                statusMessage = "This iPhone could not register for alerts: \(error.localizedDescription)"
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
              AlertControlPolicy.shouldAttemptRegistration(alertsEnabled: enabled) else { return }
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
            statusMessage = "Watchlist saved locally; alert sync failed: \(error.localizedDescription)"
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
            statusMessage = "The server registration was not removed and may still receive alerts. Retry deletion: \(error.localizedDescription)"
        }
        alertsEnabled = await deviceAPI.alertsEnabled()
        hasStoredRegistration = await deviceAPI.hasStoredRegistration()
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

@main struct Probe {
 @MainActor static func main() async {
   let service = NotificationRegistrationService()
   try! await DeviceAPI.shared.setAlertsEnabled(true)
   await service.disableAlerts()
   print("offline delete:", await DeviceAPI.shared.deletions, "stored:", await DeviceAPI.shared.hasStoredRegistration())
   await DeviceAPI.shared.recoverNetwork()
   let relaunchedService = NotificationRegistrationService()
   await relaunchedService.synchronize(terms: ["milk"])
   print("after online relaunch sync:", await DeviceAPI.shared.deletions, "stored:", await DeviceAPI.shared.hasStoredRegistration(), "message:", relaunchedService.statusMessage)
   let request = Task { await service.requestAfterFirstWatchTerm(terms: ["milk"]) }
   while UNUserNotificationCenter.instance.authorizationWaiter == nil { await Task.yield() }
   await service.disableAlerts()
   print("after later opt-out:", await DeviceAPI.shared.alertsEnabled())
   UNUserNotificationCenter.instance.authorizationWaiter?.resume(returning: true)
   await request.value
   print("after earlier permission result:", await DeviceAPI.shared.alertsEnabled(), "registrations:", UIApplication.shared.registered)
 }
}
