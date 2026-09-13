import Foundation

public struct ResponseGenerationTicket: Equatable, Sendable {
    public let generation: UInt64
    public let signature: String
    public let pageKey: String
}

public struct ResponseGenerationGate: Sendable {
    private var latestGeneration: UInt64 = 0

    public init() {}

    public mutating func begin(signature: String, pageKey: String) -> ResponseGenerationTicket {
        latestGeneration &+= 1
        return ResponseGenerationTicket(
            generation: latestGeneration,
            signature: signature,
            pageKey: pageKey
        )
    }

    public func accepts(_ ticket: ResponseGenerationTicket, currentSignature: String) -> Bool {
        ticket.generation == latestGeneration && ticket.signature == currentSignature
    }
}
