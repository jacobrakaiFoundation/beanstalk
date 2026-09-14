import XCTest
@testable import BeanstalkCore

final class SerializedAsyncQueueTests: XCTestCase {
    func testLaterOperationCannotFinishBeforeEarlierOperation() async {
        let queue = SerializedAsyncQueue()
        let recorder = OperationRecorder()

        let first = queue.enqueue {
            await recorder.append("first-start")
            try? await Task.sleep(for: .milliseconds(40))
            await recorder.append("first-end")
        }
        await recorder.waitUntilFirstStarted()
        let second = queue.enqueue {
            await recorder.append("second")
        }

        await first.value
        await second.value
        let values = await recorder.values
        XCTAssertEqual(values, ["first-start", "first-end", "second"])
    }
}

private actor OperationRecorder {
    private(set) var values: [String] = []

    func append(_ value: String) {
        values.append(value)
    }

    func waitUntilFirstStarted() async {
        while values.isEmpty {
            await Task.yield()
        }
    }
}
