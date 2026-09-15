import Foundation

public enum EnforcementBrowseMode: String, Sendable {
    case latest
    case historical
}

/// Page positions belong to the submitted search. Latest and Historical both
/// read openFDA enforcement; Latest never uses the Beanstalk notices host.
public enum BrowseRequest {
    public static let latestPageSize = 25
    public static let historicalPageSize = 25

    public static func enforcementSearch(
        mode: EnforcementBrowseMode,
        query: String,
        classification: String,
        status: String,
        page: Int
    ) -> EnforcementSearch {
        switch mode {
        case .latest:
            return EnforcementSearch(
                query: query,
                limit: latestPageSize,
                page: page
            )
        case .historical:
            return EnforcementSearch(
                query: query,
                classification: classification,
                status: status,
                limit: historicalPageSize,
                page: page
            )
        }
    }

    public static func applyEnforcement(
        existing: [EnforcementRecord],
        replacing: Bool,
        page: EnforcementRecordPage,
        requestPage: Int
    ) -> (records: [EnforcementRecord], page: Int, hasMore: Bool) {
        let combined = replacing ? page.items : existing + page.items
        var seen = Set<EnforcementRecord.ID>()
        let records = combined.filter { seen.insert($0.id).inserted }
        return (records, requestPage, page.hasMore)
    }
}
