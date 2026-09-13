import Foundation

public struct CacheHit<Value: Codable & Sendable>: Sendable {
    public let value: Value
    public let storedAt: Date
    public let isStale: Bool
}

private struct CacheEnvelope<Value: Codable>: Codable {
    let value: Value
    let storedAt: Date
}

public actor JSONFileCache {
    private let directory: URL

    public init(directory: URL) {
        self.directory = directory
    }

    public func write<Value: Codable & Sendable>(_ value: Value, key: String, storedAt: Date = Date()) throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let envelope = CacheEnvelope(value: value, storedAt: storedAt)
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        try encoder.encode(envelope).write(to: fileURL(for: key), options: .atomic)
    }

    public func read<Value: Codable & Sendable>(
        _ type: Value.Type,
        key: String,
        maxAge: TimeInterval,
        allowExpired: Bool
    ) throws -> CacheHit<Value>? {
        let url = fileURL(for: key)
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let envelope = try decoder.decode(CacheEnvelope<Value>.self, from: Data(contentsOf: url))
        let isStale = Date().timeIntervalSince(envelope.storedAt) > maxAge
        guard allowExpired || !isStale else { return nil }
        return CacheHit(value: envelope.value, storedAt: envelope.storedAt, isStale: isStale)
    }

    private func fileURL(for key: String) -> URL {
        directory.appendingPathComponent(CacheKey.filename(for: key), isDirectory: false)
    }
}
