import BeanstalkCore
import SwiftUI

struct RecallsView: View {
    @StateObject private var model = RecallsViewModel()
    @State private var showingFilters = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("Recall source", selection: $model.mode) {
                    ForEach(RecallBrowseMode.allCases) { mode in Text(mode.rawValue).tag(mode) }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal)
                .padding(.bottom, 8)
                .accessibilityHint("Choose current FDA announcements or the historical openFDA archive")

                resultsList
            }
            .navigationTitle("Recalls")
            .searchable(
                text: $model.query,
                prompt: model.mode == .latest ? "Product, hazard, or company" : "Search the historical archive"
            )
            .toolbar {
                if model.mode == .historical {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { showingFilters = true } label: {
                            Label("Filters", systemImage: "line.3.horizontal.decrease.circle")
                        }
                    }
                }
            }
            .sheet(isPresented: $showingFilters) {
                EnforcementFilterView(classification: $model.classification, status: $model.status)
            }
            .navigationDestination(for: RecallNotice.self) { NoticeDetailView(notice: $0) }
            .navigationDestination(for: EnforcementRecord.self) { EnforcementDetailView(record: $0) }
            .task(id: model.searchSignature) {
                try? await Task.sleep(for: .milliseconds(350))
                guard !Task.isCancelled else { return }
                await model.reload()
            }
        }
    }

    @ViewBuilder
    private var resultsList: some View {
        List {
            Section {
                if model.mode == .latest {
                    InformationBanner(
                        icon: "checkmark.seal",
                        text: "Current items come from FDA public recall announcements. Alerts match published announcements and may not be immediate or complete."
                    )
                } else {
                    InformationBanner(
                        icon: "clock.arrow.circlepath",
                        text: "Historical enforcement records are shown as published by openFDA. This is not a live FDA recall lifecycle feed."
                    )
                }
                InformationBanner(
                    icon: "exclamationmark.shield",
                    text: "No matching record does not mean a product is safe.",
                    color: .orange
                )
                if let message = model.offlineMessage {
                    InformationBanner(icon: "wifi.slash", text: message, color: .orange)
                }
            }

            if let error = model.errorMessage {
                Section {
                    ContentUnavailableView {
                        Label("Couldn’t load recalls", systemImage: "wifi.exclamationmark")
                    } description: {
                        Text(error)
                    } actions: {
                        Button("Try Again") { Task { await model.reload() } }
                    }
                }
            } else if model.mode == .latest {
                latestResults
            } else {
                historicalResults
            }
        }
        .listStyle(.insetGrouped)
        .refreshable { await model.reload() }
        .overlay {
            if model.isLoading && ((model.mode == .latest && model.notices.isEmpty) || (model.mode == .historical && model.records.isEmpty)) {
                ProgressView("Loading recall records…")
            }
        }
    }

    @ViewBuilder
    private var latestResults: some View {
        if model.notices.isEmpty && !model.isLoading {
            ContentUnavailableView.search(text: model.query)
        } else {
            Section("Published announcements") {
                ForEach(model.notices) { notice in
                    NavigationLink(value: notice) { NoticeRow(notice: notice) }
                }
                if model.nextCursor != nil {
                    loadMoreButton
                }
            }
        }
    }

    @ViewBuilder
    private var historicalResults: some View {
        if model.records.isEmpty && !model.isLoading {
            ContentUnavailableView.search(text: model.query)
        } else {
            Section("Historical enforcement archive") {
                ForEach(model.records) { record in
                    NavigationLink(value: record) { EnforcementRow(record: record) }
                }
                if model.archiveHasMore {
                    loadMoreButton
                }
            }
        }
    }

    private var loadMoreButton: some View {
        Button {
            Task { await model.loadMore() }
        } label: {
            HStack {
                Spacer()
                if model.isLoading { ProgressView() }
                else { Text("Load more") }
                Spacer()
            }
        }
        .disabled(model.isLoading)
    }
}

private struct EnforcementFilterView: View {
    @Environment(\.dismiss) private var dismiss
    @Binding var classification: String
    @Binding var status: String

    var body: some View {
        NavigationStack {
            Form {
                Section("FDA classification") {
                    Picker("Classification", selection: $classification) {
                        Text("Any classification").tag("")
                        Text("Class I").tag("Class I")
                        Text("Class II").tag("Class II")
                        Text("Class III").tag("Class III")
                        Text("Not Yet Classified").tag("Not Yet Classified")
                    }
                }
                Section("Published status") {
                    Picker("Status", selection: $status) {
                        Text("Any status").tag("")
                        Text("Ongoing").tag("Ongoing")
                        Text("Completed").tag("Completed")
                        Text("Terminated").tag("Terminated")
                    }
                }
                Section {
                    InformationBanner(
                        icon: "line.3.horizontal.decrease.circle",
                        text: "Filters are sent to openFDA before each page is requested."
                    )
                }
            }
            .navigationTitle("Historical filters")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
        }
        .presentationDetents([.medium])
    }
}
