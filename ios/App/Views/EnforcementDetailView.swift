import BeanstalkCore
import SwiftUI

struct EnforcementDetailView: View {
    let record: EnforcementRecord

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 20) {
                Label("Enforcement record", systemImage: "clock.arrow.circlepath")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.accentColor)

                Text(record.productDescription.isEmpty ? "Product description not provided" : record.productDescription)
                    .font(.system(.title, design: .serif, weight: .semibold))
                    .accessibilityAddTraits(.isHeader)

                InformationBanner(
                    icon: "info.circle",
                    text: "These results are openFDA enforcement snapshots, not a live FDA alert feed."
                )

                Divider()

                Group {
                    SourceFact(label: "Reason for recall", value: record.reasonForRecall)
                    SourceFact(label: "Recalling firm", value: record.recallingFirm)
                    SourceFact(label: "Classification", value: sourceValue(record.rawClassification, fallback: record.classification))
                    SourceFact(label: "Status", value: sourceValue(record.rawStatus, fallback: record.status))
                    SourceFact(label: "Distribution", value: record.distributionPattern)
                    SourceFact(label: "Lots or codes", value: record.codeInfo)
                    SourceFact(label: "Additional lot or code information", value: record.moreCodeInfo)
                    SourceFact(label: "Product quantity", value: record.productQuantity)
                }

                Divider()

                Group {
                    SourceFact(label: "Recall number", value: record.recallNumber)
                    SourceFact(label: "Event ID", value: record.eventID)
                    SourceFact(label: "Published in openFDA", value: SourceDateFormatter.display(record.publicationDate))
                    SourceFact(label: "Recall initiated", value: SourceDateFormatter.display(record.recallInitiationDate))
                    SourceFact(label: "Retrieved by Beanstalk", value: record.retrievedAt.formatted(date: .abbreviated, time: .shortened))
                    SourceFact(label: "Classification date", value: SourceDateFormatter.display(record.centerClassificationDate))
                    SourceFact(label: "Termination date", value: SourceDateFormatter.display(record.terminationDate))
                    SourceFact(label: "Voluntary or mandated", value: record.voluntaryMandated)
                    SourceFact(label: "Initial firm notification", value: record.initialFirmNotification)
                }

                Group {
                    SourceFact(label: "City", value: record.city)
                    SourceFact(label: "State", value: record.state)
                    SourceFact(label: "Country", value: record.country)
                    SourceFact(label: "Address", value: [record.address1, record.address2, record.postalCode].filter { !$0.isEmpty }.joined(separator: ", "))
                }

                InformationBanner(
                    icon: "exclamationmark.shield",
                    text: "No record or status in this archive establishes that a product is safe. Verify current information with FDA.",
                    color: .orange
                )

                Link(destination: record.sourceURL) {
                    Label("Open raw openFDA source", systemImage: "arrow.up.right.square")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .accessibilityHint("Opens your external browser")
            }
            .padding()
        }
        .navigationTitle("Enforcement record")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                EnforcementSaveButton(record: record)
                ShareLink(item: record.sourceURL) {
                    Label("Share", systemImage: "square.and.arrow.up")
                }
                .accessibilityLabel("Share this historical openFDA record")
            }
        }
    }

    private func sourceValue(_ rawValue: String?, fallback: String) -> String {
        guard let rawValue = rawValue?.trimmingCharacters(in: .whitespacesAndNewlines), !rawValue.isEmpty else {
            return fallback
        }
        return rawValue
    }
}
