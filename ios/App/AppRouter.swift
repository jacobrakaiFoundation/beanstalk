import BeanstalkCore
import Combine
import Foundation

extension Notification.Name {
    static let didRegisterForRemoteNotifications = Notification.Name("Beanstalk.didRegisterForRemoteNotifications")
    static let remoteNotificationRegistrationFailed = Notification.Name("Beanstalk.remoteNotificationRegistrationFailed")
    static let didOpenRecallNotice = Notification.Name("Beanstalk.didOpenRecallNotice")
}

enum AppTab: Hashable {
    case recalls
    case saved
    case watchlist
    case settings
}

struct PendingNotice: Identifiable {
    let noticeID: String
    let matchedTerm: String?
    let matchedField: String?

    var id: String { noticeID }
}

@MainActor
final class AppRouter: ObservableObject {
    @Published var selectedTab: AppTab = .recalls
    @Published var pendingNotice: PendingNotice?
    private let pendingBuffer: PendingNotificationBuffer
    private var cancellables = Set<AnyCancellable>()

    init(pendingBuffer: PendingNotificationBuffer = .shared) {
        self.pendingBuffer = pendingBuffer
        NotificationCenter.default.publisher(for: .didOpenRecallNotice)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] notification in
                self?.handle(notification)
            }
            .store(in: &cancellables)

        if let pending = consumeBufferedPayload() {
            route(pending)
        }
    }

    private func handle(_ notification: Notification) {
        let posted = payload(from: notification)
        if let buffered = consumeBufferedPayload() {
            route(buffered)
        } else if let posted {
            route(posted)
        }
    }

    private func payload(from notification: Notification) -> PendingNotificationPayload? {
        guard let noticeID = notification.userInfo?["noticeId"] as? String else { return nil }
        return PendingNotificationPayload(
            noticeID: noticeID,
            matchedTerm: (notification.userInfo?["matchedTerm"] as? String).flatMap { $0.isEmpty ? nil : $0 },
            matchedField: (notification.userInfo?["matchedField"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        )
    }

    private func consumeBufferedPayload() -> PendingNotificationPayload? {
        do { return try pendingBuffer.consume() }
        catch { return nil }
    }

    private func route(_ payload: PendingNotificationPayload) {
        if pendingNotice?.noticeID == payload.noticeID,
           pendingNotice?.matchedTerm == payload.matchedTerm,
           pendingNotice?.matchedField == payload.matchedField {
            return
        }
        selectedTab = .recalls
        pendingNotice = PendingNotice(
            noticeID: payload.noticeID,
            matchedTerm: payload.matchedTerm,
            matchedField: payload.matchedField
        )
    }
}
