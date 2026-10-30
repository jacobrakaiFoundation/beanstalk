import XCTest
@testable import BeanstalkCore

final class PrivacyManifestTests: XCTestCase {
    func testManifestCollectsNothingWhilePushIsOff() throws {
        let iosRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let info = try Self.plist(at: iosRoot.appendingPathComponent("App/Info.plist"))
        let privacy = try Self.plist(at: iosRoot.appendingPathComponent("Resources/PrivacyInfo.xcprivacy"))

        let pushConfigured = AlertControlPolicy.isPushConfigured(infoValue: info["BEANSTALK_PUSH_CONFIGURED"])
        let collected = privacy["NSPrivacyCollectedDataTypes"] as? [[String: Any]] ?? []
        let collectedTypes = collected.compactMap { $0["NSPrivacyCollectedDataType"] as? String }
        let trackingDomains = privacy["NSPrivacyTrackingDomains"] as? [String] ?? []
        let accessedAPIs = privacy["NSPrivacyAccessedAPITypes"] as? [Any] ?? []

        XCTAssertFalse(pushConfigured)
        XCTAssertEqual(privacy["NSPrivacyTracking"] as? Bool, false)
        XCTAssertEqual(trackingDomains, [])
        XCTAssertEqual(accessedAPIs.count, 0)
        XCTAssertEqual(
            collectedTypes,
            [],
            "Push data types belong in the manifest only when BEANSTALK_PUSH_CONFIGURED is true"
        )
    }

    private static func plist(at url: URL) throws -> [String: Any] {
        let data = try Data(contentsOf: url)
        let object = try PropertyListSerialization.propertyList(from: data, options: [], format: nil)
        return try XCTUnwrap(object as? [String: Any])
    }
}
