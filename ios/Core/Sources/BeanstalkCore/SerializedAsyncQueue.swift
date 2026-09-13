import Foundation

/// Runs asynchronous operations in the order they were enqueued. Enqueueing is
/// synchronous, so callers can establish ordering before their next suspension.
public final class SerializedAsyncQueue: @unchecked Sendable {
    private let lock = NSLock()
    private var tail: Task<Void, Never>?

    public init() {}

    @discardableResult
    public func enqueue(_ operation: @escaping @Sendable () async -> Void) -> Task<Void, Never> {
        lock.lock()
        defer { lock.unlock() }
        let predecessor = tail
        let current = Task {
            if let predecessor {
                await predecessor.value
            }
            await operation()
        }
        tail = current
        return current
    }
}
