import BeanstalkCore
import SwiftData
import SwiftUI

struct WatchlistView: View {
    @Environment(\.modelContext) private var modelContext
    @EnvironmentObject private var notifications: NotificationRegistrationService
    @Query(sort: \WatchTermEntity.createdAt) private var terms: [WatchTermEntity]
    @StateObject private var model = WatchlistViewModel()
    @State private var newTerm = ""
    @State private var validationMessage: String?
    @FocusState private var termFieldFocused: Bool

    private var values: [String] { terms.map(\.normalizedTerm) }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    InformationBanner(
                        icon: "text.magnifyingglass",
                        text: "Matches use case-insensitive whole words or exact phrases and show where each match occurred. A match does not determine dietary safety."
                    )
                }

                Section("Add a watch term") {
                    HStack {
                        TextField("Example: peanut butter", text: $newTerm)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .focused($termFieldFocused)
                            .submitLabel(.done)
                            .onSubmit(addTerm)
                            .accessibilityHint("Enter one word or exact phrase")
                        Button("Add", action: addTerm)
                            .buttonStyle(.borderedProminent)
                            .disabled(!termIsValidForSubmission || terms.count >= 20)
                    }
                    if let validationMessage {
                        Text(validationMessage)
                            .font(.caption)
                            .foregroundStyle(.red)
                    } else {
                        Text("2–80 characters per term · up to 20 terms")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Section("Watching") {
                    if terms.isEmpty {
                        Text("No watch terms yet")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(terms) { term in
                            Label(term.normalizedTerm, systemImage: "bell")
                                .accessibilityLabel("Watching for \(term.normalizedTerm)")
                        }
                        .onDelete(perform: deleteTerms)
                    }
                }

                Section("Alert status") {
                    Text(notifications.statusMessage)
                        .foregroundStyle(.secondary)
                    if notifications.isWorking { ProgressView() }
                }

                if !terms.isEmpty {
                    Section("Matches in recent announcements") {
                        if let message = model.message {
                            InformationBanner(icon: "wifi.exclamationmark", text: message, color: .orange)
                        }
                        if model.isLoading && model.results.isEmpty {
                            ProgressView("Checking recent announcements…")
                        } else if model.results.isEmpty {
                            VStack(alignment: .leading, spacing: 6) {
                                Text("No recent loaded announcement matches these terms.")
                                Text("This does not mean a product is safe or that every FDA announcement has been received.")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        } else {
                            ForEach(model.results) { result in
                                NavigationLink {
                                    NoticeDetailView(notice: result.notice, offlineCopyMessage: model.message)
                                } label: {
                                    WatchMatchRow(result: result)
                                }
                            }
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Watchlist")
            .refreshable { await model.load(terms: values) }
            .task(id: values.joined(separator: "|")) {
                await model.load(terms: values)
            }
        }
    }

    private func addTerm() {
        let normalized = WatchMatcher.normalizeTerm(newTerm)
        let existingValues = values
        guard normalized.count >= 2, normalized.count <= 80 else {
            validationMessage = "Each term must contain 2–80 characters."
            return
        }
        guard terms.count < 20 else {
            validationMessage = "A watchlist can contain at most 20 terms."
            return
        }
        guard !terms.contains(where: { $0.normalizedTerm == normalized }) else {
            validationMessage = "That term is already on your watchlist."
            newTerm = ""
            return
        }
        let wasEmpty = existingValues.isEmpty
        modelContext.insert(WatchTermEntity(normalizedTerm: normalized))
        do {
            try modelContext.save()
        } catch {
            modelContext.rollback()
            validationMessage = "Beanstalk couldn't save that watch term. Try again."
            return
        }
        newTerm = ""
        validationMessage = nil
        termFieldFocused = false
        let updated = existingValues + [normalized]
        Task {
            if wasEmpty { await notifications.requestAfterFirstWatchTerm(terms: updated) }
            else { await notifications.syncWatchlist(terms: updated) }
        }
    }

    private var termIsValidForSubmission: Bool {
        let normalized = WatchMatcher.normalizeTerm(newTerm)
        return normalized.count >= 2 && normalized.count <= 80
    }

    private func deleteTerms(at offsets: IndexSet) {
        let deleting = offsets.map { terms[$0] }
        let deletingIDs = Set(deleting.map(\.persistentModelID))
        let remaining = terms.filter { !deletingIDs.contains($0.persistentModelID) }.map(\.normalizedTerm)
        deleting.forEach(modelContext.delete)
        do {
            try modelContext.save()
        } catch {
            modelContext.rollback()
            validationMessage = "Beanstalk couldn't remove that watch term. Try again."
            return
        }
        validationMessage = nil
        Task { await notifications.syncWatchlist(terms: remaining) }
    }
}

private struct WatchMatchRow: View {
    let result: NoticeWatchResult

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(result.notice.title)
                .font(.headline)
                .lineLimit(3)
            ForEach(result.matches.prefix(3)) { match in
                VStack(alignment: .leading, spacing: 2) {
                    Text("“\(match.term)” in \(match.field)")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.accentColor)
                    Text(match.evidence)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Opens the matching FDA announcement")
    }
}
