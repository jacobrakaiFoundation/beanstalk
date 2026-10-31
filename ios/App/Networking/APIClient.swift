import BeanstalkCore
import Foundation

struct LoadedValue<Value> {
    let value: Value
    let isOfflineCopy: Bool
    let cachedAt: Date?
}

enum APIClientError: LocalizedError {
    case invalidResponse
    case requestFailed(Int, String)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "The data source returned an unreadable response."
        case let .requestFailed(status, message):
            return message.isEmpty ? "The data source returned HTTP \(status)." : message
        }
    }
}

actor APIClient {
    static let shared = APIClient()

    private let session: URLSession
    private let cache: JSONFileCache
    private let decoder = JSONDecoder()

    init(session: URLSession = .shared) {
        self.session = session
        let root = (try? FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )) ?? FileManager.default.temporaryDirectory
        cache = JSONFileCache(directory: root.appendingPathComponent("Beanstalk/LastSuccessfulResults", isDirectory: true))
    }

    func notices(query: String, cursor: String? = nil, limit: Int = 30) async throws -> LoadedValue<RecallNoticePage> {
        let cacheKey = "notices|\(query)|\(cursor ?? "first")|\(limit)"
        do {
            let url = try NoticeRequestBuilder.listURL(
                baseURL: AppConfiguration.backendBaseURL,
                limit: limit,
                cursor: cursor,
                query: query
            )
            let page: RecallNoticePage = try await request(url)
            try Task.checkCancellation()
            try? await cache.write(page, key: cacheKey)
            try Task.checkCancellation()
            return LoadedValue(value: page, isOfflineCopy: false, cachedAt: nil)
        } catch {
            try Self.rethrowIfCancelled(error)
            try Task.checkCancellation()
            let liveError = error
            if let hit = try? await cache.read(
                RecallNoticePage.self,
                key: cacheKey,
                maxAge: 6 * 60 * 60,
                allowExpired: true
            ) {
                try Task.checkCancellation()
                return LoadedValue(value: hit.value, isOfflineCopy: true, cachedAt: hit.storedAt)
            }
            try Task.checkCancellation()
            throw liveError
        }
    }

    func enforcementRecords(search: EnforcementSearch) async throws -> LoadedValue<EnforcementRecordPage> {
        let cacheKey = "archive|\(search.query)|\(search.classification)|\(search.status)|\(search.limit)|\(search.page)"
        do {
            let url = try OpenFDARequestBuilder.url(for: search)
            let (data, response) = try await session.data(from: url)
            guard let http = response as? HTTPURLResponse else { throw APIClientError.invalidResponse }
            let retrievedAt = Date()
            let page: EnforcementRecordPage
            if http.statusCode == 404 {
                // openFDA documents a 404 "No matches found" response for an empty query.
                page = EnforcementRecordPage(items: [], total: 0, skip: search.skip, limit: search.limit)
            } else {
                guard (200..<300).contains(http.statusCode) else {
                    throw APIClientError.requestFailed(http.statusCode, responseMessage(from: data))
                }
                page = OpenFDAMapper.map(try decoder.decode(OpenFDAResponse.self, from: data), retrievedAt: retrievedAt)
            }
            try Task.checkCancellation()
            try? await cache.write(page, key: cacheKey)
            try Task.checkCancellation()
            return LoadedValue(value: page, isOfflineCopy: false, cachedAt: nil)
        } catch {
            try Self.rethrowIfCancelled(error)
            try Task.checkCancellation()
            let liveError = error
            if let hit = try? await cache.read(
                EnforcementRecordPage.self,
                key: cacheKey,
                maxAge: 6 * 60 * 60,
                allowExpired: true
            ) {
                try Task.checkCancellation()
                return LoadedValue(value: hit.value, isOfflineCopy: true, cachedAt: hit.storedAt)
            }
            try Task.checkCancellation()
            throw liveError
        }
    }

    private func request<Value: Decodable>(_ url: URL) async throws -> Value {
        let (data, response) = try await session.data(from: url)
        guard let http = response as? HTTPURLResponse else { throw APIClientError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            throw APIClientError.requestFailed(http.statusCode, responseMessage(from: data))
        }
        return try decoder.decode(Value.self, from: data)
    }

    private func responseMessage(from data: Data) -> String {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return "" }
        if let message = object["message"] as? String { return message }
        if let error = object["error"] as? [String: Any], let message = error["message"] as? String { return message }
        return ""
    }

    private static func rethrowIfCancelled(_ error: Error) throws {
        if error is CancellationError || Task.isCancelled || (error as? URLError)?.code == .cancelled {
            throw CancellationError()
        }
    }
}
