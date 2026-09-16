import BeanstalkCore
import Combine
import Foundation

enum RecallBrowseMode: String, CaseIterable, Identifiable {
    case latest = "Latest"
    case historical = "Historical"
    var id: String { rawValue }

    var enforcementMode: EnforcementBrowseMode {
        switch self {
        case .latest: return .latest
        case .historical: return .historical
        }
    }
}

@MainActor
final class RecallsViewModel: ObservableObject {
    @Published var mode: RecallBrowseMode = .latest
    @Published var query = ""
    @Published var classification = ""
    @Published var status = ""
    @Published private(set) var records: [EnforcementRecord] = []
    @Published private(set) var archiveHasMore = false
    @Published private(set) var isLoading = false
    @Published private(set) var errorMessage: String?
    @Published private(set) var offlineMessage: String?

    private var archivePage = 0
    private var responseGate = ResponseGenerationGate()
    private let client: APIClient

    init(client: APIClient = .shared) {
        self.client = client
    }

    var searchSignature: String {
        [mode.rawValue, query, classification, status].joined(separator: "|")
    }

    func reload() async {
        await load(replacing: true)
    }

    func loadMore() async {
        await load(replacing: false)
    }

    private func load(replacing: Bool) async {
        let capturedMode = mode
        let capturedQuery = query
        let capturedClassification = classification
        let capturedStatus = status
        if !replacing, !archiveHasMore { return }
        let capturedSignature = [
            capturedMode.rawValue,
            capturedQuery,
            capturedClassification,
            capturedStatus
        ].joined(separator: "|")
        let capturedPage = replacing ? 0 : archivePage + 1
        let ticket = responseGate.begin(signature: capturedSignature, pageKey: "page:\(capturedPage)")
        isLoading = true
        errorMessage = nil
        offlineMessage = nil
        defer {
            if responseGate.accepts(ticket, currentSignature: searchSignature) {
                isLoading = false
            }
        }

        do {
            let search = BrowseRequest.enforcementSearch(
                mode: capturedMode.enforcementMode,
                query: capturedQuery,
                classification: capturedClassification,
                status: capturedStatus,
                page: capturedPage
            )
            let loaded = try await client.enforcementRecords(search: search)
            guard responseGate.accepts(ticket, currentSignature: searchSignature) else { return }
            let applied = BrowseRequest.applyEnforcement(
                existing: records,
                replacing: replacing,
                page: loaded.value,
                requestPage: capturedPage
            )
            records = applied.records
            archivePage = applied.page
            archiveHasMore = applied.hasMore
            setOfflineMessage(loaded)
        } catch is CancellationError {
            return
        } catch {
            guard responseGate.accepts(ticket, currentSignature: searchSignature) else { return }
            errorMessage = UserFacingError.network(error, fallback: "Recall records couldn't be loaded.")
        }
    }

    private func setOfflineMessage<Value>(_ loaded: LoadedValue<Value>) {
        guard loaded.isOfflineCopy else { return }
        let date = loaded.cachedAt?.formatted(date: .abbreviated, time: .shortened) ?? "an earlier session"
        offlineMessage = "Live retrieval failed. Showing the last successful copy from \(date)."
    }
}
