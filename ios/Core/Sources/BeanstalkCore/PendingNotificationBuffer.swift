import Foundation

public struct PendingNotificationPayload: Codable, Equatable, Sendable {
    public let noticeID: String
    public let matchedTerm: String?
    public let matchedField: String?

    public init(noticeID: String, matchedTerm: String?, matchedField: String?) {
        self.noticeID = noticeID
        self.matchedTerm = matchedTerm
        self.matchedField = matchedField
    }
}

/// A one-item, app-owned buffer for notification taps that arrive before the
/// SwiftUI router subscribes. Consuming atomically removes the saved payload.
public final class PendingNotificationBuffer: @unchecked Sendable {
    public static let shared: PendingNotificationBuffer = {
        let root = (try? FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )) ?? FileManager.default.temporaryDirectory
        return PendingNotificationBuffer(directory: root.appendingPathComponent("Beanstalk", isDirectory: true))
    }()

    private let directory: URL
    private let lock = NSLock()
    private let filename = "pending-notification.json"

    public init(directory: URL) {
        self.directory = directory
    }

    public func store(_ payload: PendingNotificationPayload) throws {
        lock.lock()
        defer { lock.unlock() }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try JSONEncoder().encode(payload).write(to: fileURL, options: .atomic)
    }

    public func consume() throws -> PendingNotificationPayload? {
        lock.lock()
        defer { lock.unlock() }
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return nil }
        do {
            let data = try Data(contentsOf: fileURL)
            let payload = try JSONDecoder().decode(PendingNotificationPayload.self, from: data)
            try FileManager.default.removeItem(at: fileURL)
            return payload
        } catch {
            try? FileManager.default.removeItem(at: fileURL)
            throw error
        }
    }

    private var fileURL: URL {
        directory.appendingPathComponent(filename, isDirectory: false)
    }
}
