import Foundation

public enum AlertSettingsAction: Equatable, Sendable {
    case turnOn
    case turnOff
    case none
}

public enum AlertControlPolicy {
    public static let unavailableMessage = "Coming soon"

    public static let enableFailedMessage =
        "Beanstalk couldn't turn alerts on. Watch terms stay on this device."

    /// Local user intent controls the Settings action. A pending or failed
    /// backend registration must never hide the ability to turn alerts off.
    /// Unavailable push hides Enable and never claims alerts are on.
    public static func settingsAction(
        alertsEnabled: Bool,
        alertsAvailable: Bool,
        watchTermCount: Int
    ) -> AlertSettingsAction {
        if alertsEnabled { return .turnOff }
        if !alertsAvailable { return .none }
        if watchTermCount > 0 { return .turnOn }
        return .none
    }

    public static func shouldOfferEnable(
        alertsEnabled: Bool,
        alertsAvailable: Bool,
        watchTermCount: Int
    ) -> Bool {
        settingsAction(
            alertsEnabled: alertsEnabled,
            alertsAvailable: alertsAvailable,
            watchTermCount: watchTermCount
        ) == .turnOn
    }

    public static func shouldAttemptRegistration(alertsEnabled: Bool, alertsAvailable: Bool) -> Bool {
        alertsEnabled && alertsAvailable
    }

    /// Info.plist `BEANSTALK_PUSH_CONFIGURED`. Missing, false, or any other
    /// value means push is not configured. There is no Firebase equivalent.
    public static func isPushConfigured(infoValue: Any?) -> Bool {
        switch infoValue {
        case let flag as Bool:
            return flag
        case let number as NSNumber:
            return number.boolValue
        case let text as String:
            switch text.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
            case "1", "true", "yes":
                return true
            default:
                return false
            }
        default:
            return false
        }
    }
}
