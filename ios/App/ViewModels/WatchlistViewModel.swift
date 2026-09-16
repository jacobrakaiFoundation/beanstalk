import BeanstalkCore
import Combine
import Foundation

struct NoticeWatchResult: Identifiable {
    var id: String { notice.id }
    let notice: RecallNotice
    let matches: [WatchMatch]
}

@MainActor
final class WatchlistViewModel: ObservableObject {
    @Published private(set) var results: [NoticeWatchResult] = []
    @Published private(set) var isLoading = false
    @Published private(set) var message: String?
    private var responseGate = ResponseGenerationGate()
    private var currentTermSignature = ""

    func load(terms: [String]) async {
        let capturedTerms = Array(Set(terms.map(WatchMatcher.normalizeTerm).filter { !$0.isEmpty })).sorted()
        let capturedSignature = capturedTerms.joined(separator: "\u{1F}")
        currentTermSignature = capturedSignature
        let ticket = responseGate.begin(signature: capturedSignature, pageKey: "recent-notices")
        guard !capturedTerms.isEmpty else {
            results = []
            message = nil
            isLoading = false
            return
        }
        isLoading = true
        message = nil
        defer {
            if responseGate.accepts(ticket, currentSignature: currentTermSignature) {
                isLoading = false
            }
        }
        do {
            let loaded = try await APIClient.shared.notices(query: "", limit: 100)
            guard responseGate.accepts(ticket, currentSignature: currentTermSignature) else { return }
            results = loaded.value.items.compactMap { notice in
                let matches = WatchMatcher.matches(terms: capturedTerms, fields: notice.searchableFields)
                return matches.isEmpty ? nil : NoticeWatchResult(notice: notice, matches: matches)
            }
            if loaded.isOfflineCopy {
                message = "Live retrieval failed; matches use the last successful local copy."
            } else {
                message = nil
            }
        } catch is CancellationError {
            return
        } catch {
            guard responseGate.accepts(ticket, currentSignature: currentTermSignature) else { return }
            results = []
            message = UserFacingError.network(
                error,
                fallback: "Recent announcements couldn't be checked. Your saved watch terms remain on this device."
            )
        }
    }
}
