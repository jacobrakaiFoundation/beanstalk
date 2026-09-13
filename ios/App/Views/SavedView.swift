import SwiftData
import SwiftUI

struct SavedView: View {
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \SavedRecallItem.savedAt, order: .reverse) private var items: [SavedRecallItem]

    var body: some View {
        NavigationStack {
            Group {
                if items.isEmpty {
                    ContentUnavailableView {
                        Label("No saved recalls", systemImage: "bookmark")
                    } description: {
                        Text("Save a current announcement or historical record to keep an offline copy on this iPhone.")
                    }
                } else {
                    List {
                        Section {
                            InformationBanner(
                                icon: "internaldrive",
                                text: "Saved copies may become outdated. Open the source link in each record before acting."
                            )
                        }
                        Section("Saved on this iPhone") {
                            ForEach(items) { item in
                                savedLink(for: item)
                            }
                            .onDelete(perform: delete)
                        }
                    }
                    .listStyle(.insetGrouped)
                }
            }
            .navigationTitle("Saved")
        }
    }

    @ViewBuilder
    private func savedLink(for item: SavedRecallItem) -> some View {
        if let notice = item.decodeNotice(), item.kind == .notice {
            NavigationLink { NoticeDetailView(notice: notice) } label: { SavedRow(item: item) }
        } else if let record = item.decodeRecord(), item.kind == .enforcement {
            NavigationLink { EnforcementDetailView(record: record) } label: { SavedRow(item: item) }
        } else {
            VStack(alignment: .leading) {
                Text(item.title).font(.headline)
                Text("Saved copy could not be read").font(.caption).foregroundStyle(.secondary)
            }
            .accessibilityElement(children: .combine)
        }
    }

    private func delete(at offsets: IndexSet) {
        offsets.map { items[$0] }.forEach(modelContext.delete)
        try? modelContext.save()
    }
}

private struct SavedRow: View {
    let item: SavedRecallItem

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(item.title).font(.headline).lineLimit(3)
            Text(item.subtitle).font(.subheadline).foregroundStyle(.secondary)
            Text("Saved \(item.savedAt.formatted(date: .abbreviated, time: .shortened))")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }
}
