import BeanstalkCore
import Combine
import Foundation

enum RecallBrowseMode: String, CaseIterable, Identifiable {
    case latest = "Latest"
    case historical = "Historical"
    var id: String { rawValue }
}

@MainActor
final class RecallsViewModel: ObservableObject {
    @Published var mode: RecallBrowseMode = .latest
    @Published var query = ""
    @Published var classification = ""
    @Published var status = ""
    @Published private(set) var notices: [RecallNotice] = []
    @Published private(set) var records: [EnforcementRecord] = []
    @Published private(set) var nextCursor: String?
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
        if !replacing {
            if capturedMode == .latest, nextCursor == nil { return }
            if capturedMode == .historical, !archiveHasMore { return }
        }
        let capturedSignature = [
            capturedMode.rawValue,
            capturedQuery,
            capturedClassification,
            capturedStatus
        ].joined(separator: "|")
        let capturedCursor = replacing ? nil : nextCursor
        let capturedPage = replacing ? 0 : archivePage + 1
        let pageKey = capturedMode == .latest
            ? "cursor:\(capturedCursor ?? "first")"
            : "page:\(capturedPage)"
        let ticket = responseGate.begin(signature: capturedSignature, pageKey: pageKey)
        isLoading = true
        errorMessage = nil
        offlineMessage = nil
        defer {
            if responseGate.accepts(ticket, currentSignature: searchSignature) {
                isLoading = false
            }
        }

        do {
            switch capturedMode {
            case .latest:
                let loaded = try await client.notices(query: capturedQuery, cursor: capturedCursor)
                guard responseGate.accepts(ticket, currentSignature: searchSignature) else { return }
                notices = replacing ? loaded.value.items : deduplicated(notices + loaded.value.items)
                nextCursor = loaded.value.nextCursor
                setOfflineMessage(loaded)
            case .historical:
                let search = EnforcementSearch(
                    query: capturedQuery,
                    classification: capturedClassification,
                    status: capturedStatus,
                    limit: 25,
                    page: capturedPage
                )
                let loaded = try await client.enforcementRecords(search: search)
                guard responseGate.accepts(ticket, currentSignature: searchSignature) else { return }
                records = replacing ? loaded.value.items : deduplicated(records + loaded.value.items)
                archivePage = capturedPage
                archiveHasMore = loaded.value.hasMore
                setOfflineMessage(loaded)
            }
        } catch is CancellationError {
            return
        } catch {
            guard responseGate.accepts(ticket, currentSignature: searchSignature) else { return }
            errorMessage = error.localizedDescription
        }
    }

    private func setOfflineMessage<Value>(_ loaded: LoadedValue<Value>) {
        guard loaded.isOfflineCopy else { return }
        let date = loaded.cachedAt?.formatted(date: .abbreviated, time: .shortened) ?? "an earlier session"
        offlineMessage = "Live retrieval failed. Showing the last successful copy from \(date)."
    }

    private func deduplicated<Item: Identifiable>(_ values: [Item]) -> [Item] where Item.ID: Hashable {
        var seen = Set<Item.ID>()
        return values.filter { seen.insert($0.id).inserted }
    }
}
