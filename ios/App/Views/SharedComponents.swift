import BeanstalkCore
import SwiftData
import SwiftUI

struct BeanstalkHeader: View {
    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            BeanstalkMark()
                .stroke(Color.accentColor, style: StrokeStyle(lineWidth: 2.2, lineCap: .round, lineJoin: .round))
                .frame(width: 42, height: 42)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text("Beanstalk")
                    .font(.system(.title, design: .serif, weight: .semibold))
                Text("Published food recall records")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

struct BeanstalkMark: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(x: rect.minX + rect.width * x / 48, y: rect.minY + rect.height * y / 48)
        }
        path.move(to: point(23, 39))
        path.addCurve(to: point(30, 18), control1: point(22, 30), control2: point(24, 24))
        path.move(to: point(24, 29))
        path.addCurve(to: point(14, 22), control1: point(21, 25), control2: point(18, 23))
        path.move(to: point(25, 24))
        path.addCurve(to: point(40, 10), control1: point(24, 15), control2: point(31, 9))
        path.addCurve(to: point(25, 24), control1: point(40, 19), control2: point(34, 26))
        path.move(to: point(24, 29))
        path.addCurve(to: point(9, 17), control1: point(15, 31), control2: point(8, 25))
        path.addCurve(to: point(24, 29), control1: point(18, 16), control2: point(26, 21))
        return path
    }
}

struct InformationBanner: View {
    let icon: String
    let text: String
    var color: Color = .accentColor

    var body: some View {
        Label {
            Text(text)
                .font(.footnote)
                .fixedSize(horizontal: false, vertical: true)
        } icon: {
            Image(systemName: icon)
                .foregroundStyle(color)
        }
        .padding(.vertical, 6)
        .accessibilityElement(children: .combine)
    }
}

struct NoticeRow: View {
    let notice: RecallNotice

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text("FDA announcement")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.accentColor)
                Spacer()
                Text(SourceDateFormatter.display(notice.publicationDate))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Text(notice.title)
                .font(.headline)
                .foregroundStyle(.primary)
            if let company = notice.companyName, !company.isEmpty {
                Text(company)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            if let classification = notice.classification, !classification.isEmpty {
                Text(classification)
                    .font(.caption.weight(.medium))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(.thinMaterial, in: Capsule())
            }
        }
        .padding(.vertical, 5)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Opens the full FDA announcement details")
    }
}

struct EnforcementRow: View {
    let record: EnforcementRecord

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(record.classification)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.accentColor)
                Spacer()
                Text(SourceDateFormatter.display(record.publicationDate))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Text(record.productDescription.isEmpty ? "Product description not provided" : record.productDescription)
                .font(.headline)
                .foregroundStyle(.primary)
            Text(record.recallingFirm.isEmpty ? "Recalling firm not provided" : record.recallingFirm)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Text("Historical · as published by openFDA")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 5)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Opens historical enforcement record details")
    }
}

struct SourceFact: View {
    let label: String
    let value: String

    var body: some View {
        if !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            VStack(alignment: .leading, spacing: 4) {
                Text(label.uppercased())
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .accessibilityHidden(true)
                Text(value)
                    .font(.body)
                    .textSelection(.enabled)
            }
            .accessibilityElement(children: .combine)
        }
    }
}

struct NoticeSaveButton: View {
    @Environment(\.modelContext) private var modelContext
    @Query private var savedItems: [SavedRecallItem]
    let notice: RecallNotice

    private var existing: SavedRecallItem? {
        savedItems.first { $0.stableID == "notice:\(notice.id)" }
    }

    var body: some View {
        Button {
            if let existing { modelContext.delete(existing) }
            else if let item = try? SavedRecallItem(notice: notice) { modelContext.insert(item) }
            try? modelContext.save()
        } label: {
            Label(existing == nil ? "Save" : "Saved", systemImage: existing == nil ? "bookmark" : "bookmark.fill")
        }
        .accessibilityLabel(existing == nil ? "Save this recall" : "Remove this recall from saved items")
    }
}

struct EnforcementSaveButton: View {
    @Environment(\.modelContext) private var modelContext
    @Query private var savedItems: [SavedRecallItem]
    let record: EnforcementRecord

    private var existing: SavedRecallItem? {
        savedItems.first { $0.stableID == "enforcement:\(record.id)" }
    }

    var body: some View {
        Button {
            if let existing { modelContext.delete(existing) }
            else if let item = try? SavedRecallItem(record: record) { modelContext.insert(item) }
            try? modelContext.save()
        } label: {
            Label(existing == nil ? "Save" : "Saved", systemImage: existing == nil ? "bookmark" : "bookmark.fill")
        }
        .accessibilityLabel(existing == nil ? "Save this historical record" : "Remove this record from saved items")
    }
}
