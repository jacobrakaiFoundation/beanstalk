import XCTest
@testable import BeanstalkCore

final class AlertControlPolicyTests: XCTestCase {
    func testEnabledAlertsAlwaysOfferTurnOffEvenWhenPushIsUnavailable() {
        XCTAssertEqual(
            AlertControlPolicy.settingsAction(
                alertsEnabled: true,
                alertsAvailable: false,
                watchTermCount: 0
            ),
            .turnOff
        )
        XCTAssertEqual(
            AlertControlPolicy.settingsAction(
                alertsEnabled: true,
                alertsAvailable: true,
                watchTermCount: 1
            ),
            .turnOff
        )
    }

    func testUnavailablePushHidesTheEnableControl() {
        XCTAssertEqual(
            AlertControlPolicy.settingsAction(
                alertsEnabled: false,
                alertsAvailable: false,
                watchTermCount: 3
            ),
            .none
        )
        XCTAssertFalse(
            AlertControlPolicy.shouldOfferEnable(
                alertsEnabled: false,
                alertsAvailable: false,
                watchTermCount: 3
            )
        )
    }

    func testAvailablePushOffersEnableWhenAlertsAreOffAndAWatchTermExists() {
        XCTAssertEqual(
            AlertControlPolicy.settingsAction(
                alertsEnabled: false,
                alertsAvailable: true,
                watchTermCount: 1
            ),
            .turnOn
        )
        XCTAssertTrue(
            AlertControlPolicy.shouldOfferEnable(
                alertsEnabled: false,
                alertsAvailable: true,
                watchTermCount: 1
            )
        )
    }

    func testAvailablePushStillRequiresAWatchTermBeforeEnable() {
        XCTAssertEqual(
            AlertControlPolicy.settingsAction(
                alertsEnabled: false,
                alertsAvailable: true,
                watchTermCount: 0
            ),
            .none
        )
        XCTAssertFalse(
            AlertControlPolicy.shouldOfferEnable(
                alertsEnabled: false,
                alertsAvailable: true,
                watchTermCount: 0
            )
        )
    }

    func testRegistrationRetryRequiresLocalIntentAndConfiguredPush() {
        XCTAssertTrue(
            AlertControlPolicy.shouldAttemptRegistration(alertsEnabled: true, alertsAvailable: true)
        )
        XCTAssertFalse(
            AlertControlPolicy.shouldAttemptRegistration(alertsEnabled: true, alertsAvailable: false)
        )
        XCTAssertFalse(
            AlertControlPolicy.shouldAttemptRegistration(alertsEnabled: false, alertsAvailable: true)
        )
    }

    func testUserFacingFailureMessagesAvoidSystemDiagnostics() {
        XCTAssertFalse(AlertControlPolicy.disableLocallyFailedMessage.contains("Error"))
        XCTAssertFalse(AlertControlPolicy.watchlistSyncFailedMessage.contains("NSURLError"))
        XCTAssertFalse(AlertControlPolicy.serverDeletionFailedMessage.contains("{"))
        XCTAssertFalse(AlertControlPolicy.pushRegistrationFailedMessage.contains("{"))
    }

    func testUnavailableCopyIsComingSoonNotDebugJargon() {
        XCTAssertEqual(AlertControlPolicy.unavailableMessage, "Coming soon")
        XCTAssertFalse(AlertControlPolicy.unavailableMessage.localizedCaseInsensitiveContains("debug"))
        XCTAssertFalse(AlertControlPolicy.unavailableMessage.localizedCaseInsensitiveContains("Firebase"))
        XCTAssertFalse(AlertControlPolicy.unavailableMessage.localizedCaseInsensitiveContains("configured"))
        XCTAssertEqual(
            AlertControlPolicy.enableFailedMessage,
            "Beanstalk couldn't turn alerts on. Watch terms stay on this device."
        )
    }

    func testPushConfiguredReadsExplicitInfoPlistValuesOnly() {
        XCTAssertFalse(AlertControlPolicy.isPushConfigured(infoValue: nil))
        XCTAssertFalse(AlertControlPolicy.isPushConfigured(infoValue: false))
        XCTAssertFalse(AlertControlPolicy.isPushConfigured(infoValue: "NO"))
        XCTAssertFalse(AlertControlPolicy.isPushConfigured(infoValue: ""))
        XCTAssertTrue(AlertControlPolicy.isPushConfigured(infoValue: true))
        XCTAssertTrue(AlertControlPolicy.isPushConfigured(infoValue: "YES"))
        XCTAssertTrue(AlertControlPolicy.isPushConfigured(infoValue: "true"))
        XCTAssertTrue(AlertControlPolicy.isPushConfigured(infoValue: "1"))
    }
}
