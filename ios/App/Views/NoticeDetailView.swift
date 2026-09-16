import BeanstalkCore
import SwiftUI

struct NoticeDetailView: View {
    let notice: RecallNotice
    var offlineCopyMessage: String? = nil
    var matchedTerm: String? = nil
    var matchedField: String? = nil

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 20) {
                Label("FDA public recall announcement", systemImage: "checkmark.seal")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.accentColor)

                if let offlineCopyMessage {
                    InformationBanner(icon: "wifi.slash", text: offlineCopyMessage, color: .orange)
                }

                if let matchedTerm, let matchedField {
                    NotificationMatchEvidence(
                        notice: notice,
                        matchedTerm: matchedTerm,
                        matchedField: matchedField
                    )
                }

                Text(notice.title)
                    .font(.system(.title, design: .serif, weight: .semibold))
                    .accessibilityAddTraits(.isHeader)

                Text(notice.summary)
                    .font(.body)
                    .textSelection(.enabled)

                Divider()

                Group {
                    SourceFact(label: "Product", value: notice.productDescription ?? "")
                    SourceFact(label: "Reason stated by FDA", value: notice.reasonForRecall ?? "")
                    SourceFact(label: "Company", value: notice.companyName ?? "")
                    SourceFact(label: "Classification", value: notice.classification ?? "")
                    SourceFact(label: "Status", value: notice.status ?? "")
                    SourceFact(label: "Distribution", value: notice.distribution ?? "")
                    SourceFact(label: "Lots or codes", value: notice.codeInfo ?? "")
                }

                Divider()

                SourceFact(label: "Published", value: SourceDateFormatter.display(notice.publicationDate))
                if let initiation = notice.recallInitiationDate {
                    SourceFact(label: "Recall initiated", value: SourceDateFormatter.display(initiation))
                }
                SourceFact(label: "Retrieved by Beanstalk", value: SourceDateFormatter.display(notice.retrievedAt))

                InformationBanner(
                    icon: "exclamationmark.shield",
                    text: "Use the original FDA announcement before acting. Beanstalk does not determine whether a product is safe.",
                    color: .orange
                )

                Link(destination: notice.sourceURL) {
                    Label("Open original FDA announcement", systemImage: "arrow.up.right.square")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .accessibilityHint("Opens your external browser")
            }
            .padding()
        }
        .navigationTitle("Recall details")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                NoticeSaveButton(notice: notice)
                ShareLink(item: notice.sourceURL) {
                    Label("Share", systemImage: "square.and.arrow.up")
                }
                .accessibilityLabel("Share this FDA announcement")
            }
        }
    }
}

struct RemoteNoticeDetailView: View {
    @Environment(\.dismiss) private var dismiss
    let noticeID: String
    let matchedTerm: String?
    let matchedField: String?
    @State private var notice: RecallNotice?
    @State private var errorMessage: String?
    @State private var offlineCopyMessage: String?

    var body: some View {
        NavigationStack {
            Group {
                if let notice {
                    NoticeDetailView(
                        notice: notice,
                        offlineCopyMessage: offlineCopyMessage,
                        matchedTerm: matchedTerm,
                        matchedField: matchedField
                    )
                } else if let errorMessage {
                    ContentUnavailableView {
                        Label("Recall unavailable", systemImage: "exclamationmark.triangle")
                    } description: {
                        Text(errorMessage)
                    } actions: {
                        Button("Try Again") { Task { await load() } }
                    }
                } else {
                    ProgressView("Loading recall announcement…")
                }
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
            }
        }
        .task { await load() }
    }

    private func load() async {
        errorMessage = nil
        do {
            let loaded = try await APIClient.shared.notice(id: noticeID)
            notice = loaded.value
            if loaded.isOfflineCopy {
                let date = loaded.cachedAt?.formatted(date: .abbreviated, time: .shortened) ?? "an earlier session"
                offlineCopyMessage = "Live retrieval failed. Showing the last successful copy from \(date)."
            } else {
                offlineCopyMessage = nil
            }
        }
        catch {
            errorMessage = UserFacingError.network(error, fallback: "This recall announcement is unavailable.")
        }
    }
}

private struct NotificationMatchEvidence: View {
    let notice: RecallNotice
    let matchedTerm: String
    let matchedField: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Matched “\(matchedTerm)” in \(fieldLabel)", systemImage: "bell.badge")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color.accentColor)
            if let sourceExcerpt {
                Text(sourceExcerpt)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
                    .accessibilityLabel("Matched source excerpt: \(sourceExcerpt)")
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.accentColor.opacity(0.1), in: RoundedRectangle(cornerRadius: 14))
        .accessibilityElement(children: .combine)
    }

    private var fieldLabel: String {
        switch matchedField {
        case "title": return "the title"
        case "summary": return "the FDA summary"
        case "productDescription": return "the product description"
        case "reasonForRecall": return "the reason for recall"
        case "companyName": return "the company name"
        case "distribution": return "the distribution wording"
        case "codeInfo": return "the lot or code information"
        default: return "the FDA announcement"
        }
    }

    private var sourceValue: String? {
        switch matchedField {
        case "title": return notice.title
        case "summary": return notice.summary
        case "productDescription": return notice.productDescription
        case "reasonForRecall": return notice.reasonForRecall
        case "companyName": return notice.companyName
        case "distribution": return notice.distribution
        case "codeInfo": return notice.codeInfo
        default: return nil
        }
    }

    private var sourceExcerpt: String? {
        guard let sourceValue, !sourceValue.isEmpty else { return nil }
        guard sourceValue.count > 280 else { return sourceValue }

        let match = sourceValue.range(
            of: matchedTerm,
            options: [.caseInsensitive, .diacriticInsensitive]
        )
        guard let match else { return String(sourceValue.prefix(280)) + "…" }

        let matchStart = sourceValue.distance(from: sourceValue.startIndex, to: match.lowerBound)
        let matchEnd = sourceValue.distance(from: sourceValue.startIndex, to: match.upperBound)
        let lowerOffset = max(0, matchStart - 90)
        let upperOffset = min(sourceValue.count, matchEnd + 150)
        let lower = sourceValue.index(sourceValue.startIndex, offsetBy: lowerOffset)
        let upper = sourceValue.index(sourceValue.startIndex, offsetBy: upperOffset)
        let prefix = lowerOffset == 0 ? "" : "…"
        let suffix = upperOffset == sourceValue.count ? "" : "…"
        return prefix + String(sourceValue[lower..<upper]) + suffix
    }
}
