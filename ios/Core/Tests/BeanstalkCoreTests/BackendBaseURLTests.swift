import Foundation
import XCTest

/// Locks the host the iOS app ships. `AppConfiguration` is not in this package,
/// so the test reads the plist and the fallback source the app target compiles.
final class BackendBaseURLTests: XCTestCase {
    func testShippedBackendBaseURLIsTheResolvableHost() throws {
        let appDirectory = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("App", isDirectory: true)

        let plist = try PropertyListSerialization.propertyList(
            from: Data(contentsOf: appDirectory.appendingPathComponent("Info.plist")),
            format: nil
        ) as? [String: Any]
        let configured = try XCTUnwrap(plist?["BEANSTALK_BACKEND_BASE_URL"] as? String)
        XCTAssertEqual(configured, "https://api.jacobrakai.org")

        let fallback = try String(
            contentsOf: appDirectory.appendingPathComponent("AppConfiguration.swift"),
            encoding: .utf8
        )
        XCTAssertTrue(fallback.contains("?? URL(string: \"\(configured)\")!"))
    }
}
