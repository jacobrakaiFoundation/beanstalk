import XCTest
@testable import BeanstalkCore

final class PendingNotificationBufferTests: XCTestCase {
    func testPayloadSurvivesBufferRecreationAndIsConsumedOnce() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let payload = PendingNotificationPayload(
            noticeID: "notice_123",
            matchedTerm: "salmonella",
            matchedField: "reasonForRecall"
        )

        try PendingNotificationBuffer(directory: directory).store(payload)
        let relaunchedBuffer = PendingNotificationBuffer(directory: directory)

        XCTAssertEqual(try relaunchedBuffer.consume(), payload)
        XCTAssertNil(try relaunchedBuffer.consume())
    }
}
