import XCTest
@testable import BeanstalkCore

final class AlertControlPolicyTests: XCTestCase {
    func testEnabledAlertsAlwaysOfferTurnOffWithoutBackendRegistration() {
        XCTAssertEqual(
            AlertControlPolicy.settingsAction(
                alertsEnabled: true,
                hasBackendRegistration: false,
                watchTermCount: 1
            ),
            .turnOff
        )
    }

    func testEnabledAlertsOfferTurnOffWithBackendRegistration() {
        XCTAssertEqual(
            AlertControlPolicy.settingsAction(
                alertsEnabled: true,
                hasBackendRegistration: true,
                watchTermCount: 1
            ),
            .turnOff
        )
    }

    func testRegistrationRetryFollowsLocalAlertIntent() {
        XCTAssertTrue(AlertControlPolicy.shouldAttemptRegistration(alertsEnabled: true))
        XCTAssertFalse(AlertControlPolicy.shouldAttemptRegistration(alertsEnabled: false))
    }
}
