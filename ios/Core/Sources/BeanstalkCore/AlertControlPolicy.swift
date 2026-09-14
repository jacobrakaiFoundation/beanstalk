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
