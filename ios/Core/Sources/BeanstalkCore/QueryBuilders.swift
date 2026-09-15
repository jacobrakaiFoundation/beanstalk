import Foundation

public enum QueryBuilderError: Error, Equatable {
    case invalidBaseURL
    case offsetBeyondOpenFDALimit
}

public enum NoticeRequestBuilder {
    public static func listURL(baseURL: URL, limit: Int, cursor: String?, query: String?) throws -> URL {
        guard var components = URLComponents(url: baseURL.appendingPathComponent("v1/notices"), resolvingAgainstBaseURL: false) else {
            throw QueryBuilderError.invalidBaseURL
        }
        var items = [URLQueryItem(name: "limit", value: String(max(1, min(limit, 100))))]
        if let cursor, !cursor.isEmpty { items.append(URLQueryItem(name: "cursor", value: cursor)) }
        if let query = sanitized(query), !query.isEmpty {
            items.append(URLQueryItem(name: "query", value: String(query.prefix(120))))
        }
        components.queryItems = items
        guard let url = components.url else { throw QueryBuilderError.invalidBaseURL }
        return url
    }

    public static func detailURL(baseURL: URL, id: String) -> URL {
        baseURL.appendingPathComponent("v1/notices").appendingPathComponent(id)
    }

    private static func sanitized(_ value: String?) -> String? {
        value?.replacingOccurrences(of: "\"", with: "")
            .replacingOccurrences(of: "\\", with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

public struct EnforcementSearch: Equatable, Sendable {
    public var query: String
    public var classification: String
    public var status: String
    public var limit: Int
    public var page: Int

    public init(query: String = "", classification: String = "", status: String = "", limit: Int = 20, page: Int = 0) {
        self.query = query
        self.classification = classification
        self.status = status
        self.limit = limit
        self.page = page
    }

    public var skip: Int { max(0, page) * max(1, min(limit, 100)) }
}

public enum OpenFDARequestBuilder {
    public static func url(for request: EnforcementSearch) throws -> URL {
        guard request.skip <= 25_000 else { throw QueryBuilderError.offsetBeyondOpenFDALimit }
        guard var components = URLComponents(string: "https://api.fda.gov/food/enforcement.json") else {
            throw QueryBuilderError.invalidBaseURL
        }

        var predicates: [String] = []
        let query = sanitize(request.query)
        if !query.isEmpty {
            predicates.append("(product_description:\"\(query)\" OR reason_for_recall:\"\(query)\" OR recalling_firm:\"\(query)\")")
        }
        let classification = sanitize(request.classification)
        if !classification.isEmpty { predicates.append("classification:\"\(classification)\"") }
        let status = sanitize(request.status)
        if !status.isEmpty { predicates.append("status:\"\(status)\"") }

        var queryItems: [URLQueryItem] = []
        if !predicates.isEmpty {
            // All filters are composed into the server-side search before limit/skip are applied.
            queryItems.append(URLQueryItem(name: "search", value: predicates.joined(separator: " AND ")))
        }
        queryItems.append(URLQueryItem(name: "limit", value: String(max(1, min(request.limit, 100)))))
        queryItems.append(URLQueryItem(name: "skip", value: String(request.skip)))
        queryItems.append(URLQueryItem(name: "sort", value: "report_date:desc"))
        components.queryItems = queryItems
        guard let url = components.url else { throw QueryBuilderError.invalidBaseURL }
        return url
    }

    public static func sanitize(_ query: String) -> String {
        query.replacingOccurrences(of: "\"", with: "")
            .replacingOccurrences(of: "\\", with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
