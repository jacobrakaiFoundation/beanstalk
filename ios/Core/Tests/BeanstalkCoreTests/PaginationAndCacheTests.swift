import XCTest
@testable import BeanstalkCore

private struct TestItem: Codable, Identifiable, Equatable, Sendable {
    let id: Int
    let value: String
}

final class PaginationAndCacheTests: XCTestCase {
    func testCursorAccumulatorReplacesAppendsAndDeduplicates() {
        var accumulator = CursorAccumulator<TestItem>()
        accumulator.merge(
            CursorPage(items: [TestItem(id: 1, value: "one"), TestItem(id: 2, value: "two")], nextCursor: "page-2"),
            replacing: true
        )
        accumulator.merge(
            CursorPage(items: [TestItem(id: 2, value: "two again"), TestItem(id: 3, value: "three")], nextCursor: nil),
            replacing: false
        )

        XCTAssertEqual(accumulator.items.map(\.id), [1, 2, 3])
        XCTAssertFalse(accumulator.canLoadMore)
    }

    func testFileCacheReturnsFreshAndExplicitlyAllowedStaleData() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let cache = JSONFileCache(directory: directory)
        let value = [TestItem(id: 1, value: "cached")]

        try await cache.write(value, key: "latest:milk", storedAt: Date())
        let fresh = try await cache.read([TestItem].self, key: "latest:milk", maxAge: 60, allowExpired: false)
        XCTAssertEqual(fresh?.value, value)
        XCTAssertEqual(fresh?.isStale, false)

        try await cache.write(value, key: "latest:milk", storedAt: Date(timeIntervalSinceNow: -3_600))
        let refused = try await cache.read([TestItem].self, key: "latest:milk", maxAge: 60, allowExpired: false)
        let fallback = try await cache.read([TestItem].self, key: "latest:milk", maxAge: 60, allowExpired: true)
        XCTAssertNil(refused)
        XCTAssertEqual(fallback?.value, value)
        XCTAssertEqual(fallback?.isStale, true)
    }

    func testCacheKeyIsStableAndPunctuationSensitive() {
        XCTAssertEqual(CacheKey.filename(for: "milk|page:1"), CacheKey.filename(for: "milk|page:1"))
        XCTAssertNotEqual(CacheKey.filename(for: "milk/page:1"), CacheKey.filename(for: "milk|page:1"))
    }
}
