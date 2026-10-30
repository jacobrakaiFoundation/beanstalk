import Foundation

public enum AlertSettingsAction: Equatable, Sendable {
    case turnOn
    case turnOff
    case none
}

public enum AlertControlPolicy {
    public static let unavailableMessage = "Coming soon"

    /// Push-off builds must not mention alerts. The alert copy stays available
    /// for a later build that turns `BEANSTALK_PUSH_CONFIGURED` on.
    public static func showsAlertControls(alertsEnabled: Bool, alertsAvailable: Bool) -> Bool {
        alertsEnabled || alertsAvailable
    }

    public static func freeAppDescription(alertsAvailable: Bool) -> String {
        if alertsAvailable {
            return "Beanstalk is free. Every search, saved record, watch term, and alert feature is available without payment."
        }
        return "Beanstalk is free. Every search, saved record, and watch term is available without payment."
    }

    public static func donationDescription(alertsAvailable: Bool) -> String {
        if alertsAvailable {
            return "Donations are optional. Donating unlocks nothing in Beanstalk and does not change recall results or alerts."
        }
        return "Donations are optional. Donating unlocks nothing in Beanstalk and does not change recall results."
    }

    public static let enableFailedMessage =
        "Beanstalk couldn't turn alerts on. Watch terms stay on this device."

    public static let disableLocallyFailedMessage =
        "Could not save the alert opt-out on this iPhone. Try again in Settings."

    public static let watchlistSyncFailedMessage =
        "Watchlist saved locally; alert sync failed. Try again later."

    public static let serverDeletionFailedMessage =
        "The server registration was not removed and may still receive alerts. Retry deletion from Settings."

    public static let pushRegistrationFailedMessage =
        "This iPhone could not register for alerts. Try again later."

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
