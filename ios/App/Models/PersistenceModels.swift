import BeanstalkCore
import Foundation
import SwiftData

enum SavedRecallKind: String, Codable {
    case notice
    case enforcement
}

@Model
final class SavedRecallItem {
    @Attribute(.unique) var stableID: String
    var kindRawValue: String
    var title: String
    var subtitle: String
    var payload: Data
    var savedAt: Date

    var kind: SavedRecallKind { SavedRecallKind(rawValue: kindRawValue) ?? .notice }

    init(notice: RecallNotice) throws {
        stableID = "notice:\(notice.id)"
        kindRawValue = SavedRecallKind.notice.rawValue
        title = notice.title
        subtitle = notice.companyName ?? "FDA public recall announcement"
        payload = try JSONEncoder().encode(notice)
        savedAt = Date()
    }

    init(record: EnforcementRecord) throws {
        stableID = "enforcement:\(record.id)"
        kindRawValue = SavedRecallKind.enforcement.rawValue
        title = record.productDescription.isEmpty ? "Historical enforcement record" : record.productDescription
        subtitle = record.recallingFirm.isEmpty ? "As published by openFDA" : record.recallingFirm
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        payload = try encoder.encode(record)
        savedAt = Date()
    }

    func decodeNotice() -> RecallNotice? {
        try? JSONDecoder().decode(RecallNotice.self, from: payload)
    }

    func decodeRecord() -> EnforcementRecord? {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try? decoder.decode(EnforcementRecord.self, from: payload)
    }
}

@Model
final class WatchTermEntity {
    @Attribute(.unique) var normalizedTerm: String
    var createdAt: Date

    init(normalizedTerm: String, createdAt: Date = Date()) {
        self.normalizedTerm = normalizedTerm
        self.createdAt = createdAt
    }
}
