import BeanstalkCore
import SwiftUI

struct NoticeDetailView: View {
    let notice: RecallNotice
    var offlineCopyMessage: String? = nil

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 20) {
                Label("FDA public recall announcement", systemImage: "checkmark.seal")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.accentColor)

                if let offlineCopyMessage {
                    InformationBanner(icon: "wifi.slash", text: offlineCopyMessage, color: .orange)
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
