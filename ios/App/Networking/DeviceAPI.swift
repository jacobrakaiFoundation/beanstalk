import Foundation

private struct DeviceCredentials: Codable {
    let deviceID: String
    let clientSecret: String
}

private struct DeviceRegistrationResponse: Decodable {
    let deviceId: String
    let clientSecret: String
}

private struct RegisterDeviceBody: Encodable {
    let deviceToken: String
    let environment: String
}

private struct WatchlistBody: Encodable {
    let terms: [String]
}

enum DeviceAPIError: LocalizedError {
    case unauthorized
    case requestFailed(Int)
    case invalidResponse

    var errorDescription: String? {
        switch self {
        case .unauthorized: return "This device registration expired and will be recreated."
        case let .requestFailed(status): return "Notification service returned HTTP \(status)."
        case .invalidResponse: return "Notification service returned an unreadable response."
        }
    }
}

enum DeviceDeletionResult {
    case deleted
    case noStoredRegistration
    case credentialsExpired
}

actor DeviceAPI {
    private let baseURL: URL
    private let session: URLSession
    private let keychain = KeychainStore(service: "org.jacobrakaifoundation.beanstalk.notifications")
    private let credentialsAccount = "device-credentials"
    private let tokenAccount = "apns-token"
    private let alertsEnabledAccount = "alerts-enabled"

    init(baseURL: URL = AppConfiguration.backendBaseURL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    func storedToken() -> String? {
        guard let data = try? keychain.data(for: tokenAccount) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    func saveToken(_ token: String) throws {
        try keychain.set(Data(token.utf8), for: tokenAccount)
    }

    func alertsEnabled() -> Bool {
        guard let data = try? keychain.data(for: alertsEnabledAccount) else { return false }
        return data == Data("true".utf8)
    }

    func setAlertsEnabled(_ enabled: Bool) throws {
        try keychain.set(Data((enabled ? "true" : "false").utf8), for: alertsEnabledAccount)
    }

    func disableLocally() throws {
        try setAlertsEnabled(false)
        try keychain.delete(tokenAccount)
    }

    func hasStoredRegistration() -> Bool {
        loadCredentials() != nil
    }

    func registerOrRotate(token: String, environment: String, terms: [String]) async throws {
        try saveToken(token)
        if let credentials = loadCredentials() {
            do {
                try await authenticatedRequest(
                    path: "v1/devices/me/token",
                    method: "PUT",
                    body: RegisterDeviceBody(deviceToken: token, environment: environment),
                    credentials: credentials
                )
                try await putWatchlist(terms, credentials: credentials)
                return
            } catch DeviceAPIError.unauthorized {
                try? keychain.delete(credentialsAccount)
            }
        }

        let response: DeviceRegistrationResponse = try await request(
            path: "v1/devices",
            method: "POST",
            body: RegisterDeviceBody(deviceToken: token, environment: environment)
        )
        let credentials = DeviceCredentials(deviceID: response.deviceId, clientSecret: response.clientSecret)
        try keychain.set(try JSONEncoder().encode(credentials), for: credentialsAccount)
        try await putWatchlist(terms, credentials: credentials)
    }

    func syncWatchlist(_ terms: [String]) async throws {
        guard let credentials = loadCredentials() else { throw DeviceAPIError.unauthorized }
        do {
            try await putWatchlist(terms, credentials: credentials)
        } catch DeviceAPIError.unauthorized {
            try? keychain.delete(credentialsAccount)
            throw DeviceAPIError.unauthorized
        }
    }

    func verifyRegistration() async throws -> Bool {
        guard let credentials = loadCredentials() else { return false }
        let request = try authenticatedURLRequest(path: "v1/devices/me", method: "GET", credentials: credentials)
        let (_, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw DeviceAPIError.invalidResponse }
        if http.statusCode == 401 || http.statusCode == 403 { throw DeviceAPIError.unauthorized }
        guard (200..<300).contains(http.statusCode) else { throw DeviceAPIError.requestFailed(http.statusCode) }
        return true
    }

    func deleteRegistration() async throws -> DeviceDeletionResult {
        guard let credentials = loadCredentials() else {
            return .noStoredRegistration
        }
        let request = try authenticatedURLRequest(path: "v1/devices/me", method: "DELETE", credentials: credentials)
        let (_, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw DeviceAPIError.invalidResponse }
        if http.statusCode == 401 || http.statusCode == 403 {
            try keychain.delete(credentialsAccount)
            try? keychain.delete(tokenAccount)
            return .credentialsExpired
        }
        guard (200..<300).contains(http.statusCode) || http.statusCode == 404 else {
            throw DeviceAPIError.requestFailed(http.statusCode)
        }
        try keychain.delete(credentialsAccount)
        try keychain.delete(tokenAccount)
        return .deleted
    }

    private func putWatchlist(_ terms: [String], credentials: DeviceCredentials) async throws {
        try await authenticatedRequest(
            path: "v1/devices/me/watchlist",
            method: "PUT",
            body: WatchlistBody(terms: terms),
            credentials: credentials
        )
    }

    private func loadCredentials() -> DeviceCredentials? {
        guard let data = try? keychain.data(for: credentialsAccount) else { return nil }
        return try? JSONDecoder().decode(DeviceCredentials.self, from: data)
    }

    private func authenticatedRequest<Body: Encodable>(
        path: String,
        method: String,
        body: Body,
        credentials: DeviceCredentials
    ) async throws {
        var request = try authenticatedURLRequest(path: path, method: method, credentials: credentials)
        request.httpBody = try JSONEncoder().encode(body)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let (_, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw DeviceAPIError.invalidResponse }
        if http.statusCode == 401 || http.statusCode == 403 { throw DeviceAPIError.unauthorized }
        guard (200..<300).contains(http.statusCode) else { throw DeviceAPIError.requestFailed(http.statusCode) }
    }

    private func request<Response: Decodable, Body: Encodable>(path: String, method: String, body: Body) async throws -> Response {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw DeviceAPIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else { throw DeviceAPIError.requestFailed(http.statusCode) }
        return try JSONDecoder().decode(Response.self, from: data)
    }

    private func authenticatedURLRequest(path: String, method: String, credentials: DeviceCredentials) throws -> URLRequest {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = method
        request.setValue("Bearer \(credentials.deviceID).\(credentials.clientSecret)", forHTTPHeaderField: "Authorization")
        request.cachePolicy = .reloadIgnoringLocalCacheData
        return request
    }
}
