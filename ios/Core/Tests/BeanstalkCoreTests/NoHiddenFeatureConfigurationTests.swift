import XCTest

/// App Review rejected builds that shipped a push entitlement and an Info.plist
/// switch for a feature reviewers could not reach (guideline 5.6). Keep both out.
final class NoHiddenFeatureConfigurationTests: XCTestCase {
    private let iosRoot = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()

    func testProjectDeclaresNoEntitlements() throws {
        let project = try String(contentsOf: iosRoot.appendingPathComponent("project.yml"), encoding: .utf8)
        XCTAssertFalse(project.contains("CODE_SIGN_ENTITLEMENTS"))
        XCTAssertFalse(project.contains("aps-environment"))
    }

    func testInfoPlistHasNoFeatureSwitches() throws {
        let data = try Data(contentsOf: iosRoot.appendingPathComponent("App/Info.plist"))
        let info = try XCTUnwrap(
            PropertyListSerialization.propertyList(from: data, options: [], format: nil) as? [String: Any]
        )
        let switches = info.keys.filter { $0.hasSuffix("_CONFIGURED") || $0 == "APNS_ENVIRONMENT" }
        XCTAssertEqual(switches.sorted(), [])
    }
}
