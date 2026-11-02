import Foundation
import OSLog
import Security

/// Removes state left by test builds 2-3, which could register a device with the
/// Foundation service and cache single notices. Runs once per launch until done:
/// the server DELETE is retried on the next launch while the Keychain credential
/// remains, because that credential is what authenticates the deletion.
enum LegacyRegistrationCleanup {
    private struct DeviceCredentials: Decodable {
        let deviceID: String
        let clientSecret: String
    }

    private static let keychainService = "org.jacobrakaifoundation.beanstalk.notifications"
    private static let credentialsAccount = "device-credentials"
    private static let logger = Logger(subsystem: "org.jacobrakaifoundation.beanstalk", category: "legacy-cleanup")

    static func run(baseURL: URL, cacheDirectory: URL) async {
        removeSingleNoticeCacheFiles(in: cacheDirectory)
        await deleteServerRegistration(baseURL: baseURL)
    }

    private static func deleteServerRegistration(baseURL: URL) async {
        guard let data = credentialsData() else {
            deleteKeychainItems()
            return
        }
        guard let credentials = try? JSONDecoder().decode(DeviceCredentials.self, from: data) else {
            logger.error("legacy credential unreadable; deleting it locally")
            deleteKeychainItems()
            return
        }
        var request = URLRequest(url: baseURL.appendingPathComponent("v1/devices/me"))
        request.httpMethod = "DELETE"
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("Bearer \(credentials.deviceID).\(credentials.clientSecret)", forHTTPHeaderField: "Authorization")
        do {
            let (body, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                logger.error("legacy registration delete: non-HTTP response; retrying next launch")
                return
            }
            switch http.statusCode {
            case 200..<300, 401, 403, 404:
                deleteKeychainItems()
                logger.info("legacy registration delete status=\(http.statusCode, privacy: .public)")
            default:
                let text = String(data: body.prefix(512), encoding: .utf8) ?? ""
                logger.error("legacy registration delete status=\(http.statusCode, privacy: .public) body=\(text, privacy: .public); retrying next launch")
            }
        } catch {
            logger.error("legacy registration delete failed error=\(String(describing: error), privacy: .public); retrying next launch")
        }
    }

    private static func credentialsData() -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: credentialsAccount,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status != errSecSuccess && status != errSecItemNotFound {
            logger.error("legacy credential read status=\(status, privacy: .public)")
        }
        return status == errSecSuccess ? result as? Data : nil
    }

    /// Deletes every item under the old service: credential, APNs token, and opt-in flag.
    private static func deleteKeychainItems() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService
        ]
        let status = SecItemDelete(query as CFDictionary)
        if status != errSecSuccess && status != errSecItemNotFound {
            logger.error("legacy keychain delete status=\(status, privacy: .public)")
        }
    }

    /// Cache filenames are FNV-1a hashes, so single-notice entries are identified by
    /// content: a JSON envelope whose value has an `id` and no `items` (list pages
    /// always have `items`).
    private static func removeSingleNoticeCacheFiles(in directory: URL) {
        guard let files = try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil) else {
            return
        }
        for file in files where file.pathExtension == "json" {
            guard let data = try? Data(contentsOf: file),
                  let envelope = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let value = envelope["value"] as? [String: Any],
                  value["id"] != nil, value["items"] == nil else { continue }
            do {
                try FileManager.default.removeItem(at: file)
            } catch {
                logger.error("legacy notice cache delete failed file=\(file.lastPathComponent, privacy: .public) error=\(String(describing: error), privacy: .public)")
            }
        }
    }
}
