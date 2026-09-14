import Foundation

public struct CursorPage<Item: Identifiable & Sendable>: Sendable where Item.ID: Hashable & Sendable {
    public let items: [Item]
    public let nextCursor: String?

    public init(items: [Item], nextCursor: String?) {
        self.items = items
        self.nextCursor = nextCursor
    }
}

public struct CursorAccumulator<Item: Identifiable & Sendable>: Sendable where Item.ID: Hashable & Sendable {
    public private(set) var items: [Item] = []
    public private(set) var nextCursor: String?

    public init() {}

    public var canLoadMore: Bool { nextCursor != nil }

    public mutating func merge(_ page: CursorPage<Item>, replacing: Bool) {
        var seen: Set<Item.ID> = []
        let candidates = replacing ? page.items : items + page.items
        items = candidates.filter { seen.insert($0.id).inserted }
        nextCursor = page.nextCursor
    }
}

public enum CacheKey {
    /// Stable FNV-1a key so queries can safely become filenames without collisions
    /// caused by replacing punctuation with underscores.
    public static func filename(for value: String) -> String {
        var hash: UInt64 = 14_695_981_039_346_656_037
        for byte in value.utf8 {
            hash ^= UInt64(byte)
            hash &*= 1_099_511_628_211
        }
        return String(hash, radix: 16) + ".json"
    }
}
