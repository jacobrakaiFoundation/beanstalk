import BeanstalkCore
import SwiftData
import SwiftUI
import UIKit

struct SettingsView: View {
    @Environment(\.modelContext) private var modelContext
    @EnvironmentObject private var notifications: NotificationRegistrationService
    @Query private var savedItems: [SavedRecallItem]
    @Query private var watchTerms: [WatchTermEntity]
    @State private var confirmingServerDeletion = false
    @State private var confirmingLocalDeletion = false
    @State private var localDataMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    BeanstalkHeader()
                    Text("Beanstalk is free. Every search, saved record, watch term, and alert feature is available without payment.")
                        .font(.subheadline)
                }

                Section("Notifications") {
                    Text(notifications.statusMessage)
                        .foregroundStyle(.secondary)
                    Button("Open iOS notification settings") {
                        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
                        UIApplication.shared.open(url)
                    }
                    .accessibilityHint("Opens iOS Settings")
                    switch alertSettingsAction {
                    case .turnOn:
                        Button("Turn on alerts for this watchlist") {
                            Task { await notifications.requestAfterFirstWatchTerm(terms: watchTerms.map(\.normalizedTerm)) }
                        }
                    case .turnOff:
                        Button("Remove this device from Beanstalk alerts", role: .destructive) {
                            confirmingServerDeletion = true
                        }
                    case .none:
                        EmptyView()
                    }
                    if alertSettingsAction != .turnOff, notifications.hasStoredRegistration {
                        Button("Retry Removing This Device", role: .destructive) {
                            confirmingServerDeletion = true
                        }
                    }
                }

                Section("Data on this iPhone") {
                    LabeledContent("Saved recalls", value: String(savedItems.count))
                    LabeledContent("Watch terms", value: String(watchTerms.count))
                    Button("Clear saved recalls and watch terms", role: .destructive) {
                        confirmingLocalDeletion = true
                    }
                    .disabled(savedItems.isEmpty && watchTerms.isEmpty)
                    if let localDataMessage {
                        Text(localDataMessage)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Section("Support the Foundation") {
                    Text("Donations are optional. Donating unlocks nothing in Beanstalk and does not change recall results or alerts.")
                    Link(destination: AppConfiguration.donationURL) {
                        Label("Donate to JACOBRAKAI FOUNDATION", systemImage: "arrow.up.right.square")
                    }
                    .accessibilityHint("Opens the Foundation donation page in your external browser")
                }

                Section("Help and privacy") {
                    Link("Privacy policy", destination: AppConfiguration.privacyURL)
                        .accessibilityHint("Opens your external browser")
                    Link("Support", destination: AppConfiguration.supportURL)
                        .accessibilityHint("Opens your external browser")
                }

                Section("Data sources") {
                    Text("Latest and Historical both use openFDA food-enforcement snapshots as published. The archive can lag fda.gov and is not a live FDA announcement feed.")
                    InformationBanner(
                        icon: "exclamationmark.shield",
                        text: "Beanstalk is not medical advice. No result means only that no matching record was found; it never means a product is safe.",
                        color: .orange
                    )
                    Link("FDA food recalls", destination: URL(string: "https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts")!)
                        .accessibilityHint("Opens your external browser")
                    Link("USDA FSIS recalls", destination: URL(string: "https://www.fsis.usda.gov/recalls")!)
                        .accessibilityHint("Opens your external browser")
                }

                Section("App") {
                    LabeledContent("Version", value: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0")
                    LabeledContent("Availability", value: "United States · English")
                }
            }
            .navigationTitle("Settings")
            .confirmationDialog(
                "Remove this device from Beanstalk alerts",
                isPresented: $confirmingServerDeletion,
                titleVisibility: .visible
            ) {
                Button("Remove this device", role: .destructive) {
                    Task { await notifications.disableAlerts() }
                }
            } message: {
                Text("Beanstalk will stop local alerts and delete the server registration if one exists. Your watchlist remains on this iPhone.")
            }
            .confirmationDialog(
                "Clear Beanstalk data from this iPhone?",
                isPresented: $confirmingLocalDeletion,
                titleVisibility: .visible
            ) {
                Button("Clear local data", role: .destructive, action: clearLocalData)
            } message: {
                Text("This removes saved recall copies and watch terms from this iPhone. It cannot be undone.")
            }
        }
    }

    private var alertSettingsAction: AlertSettingsAction {
        AlertControlPolicy.settingsAction(
            alertsEnabled: notifications.alertsEnabled,
            alertsAvailable: notifications.alertsAvailable,
            watchTermCount: watchTerms.count
        )
    }

    private func clearLocalData() {
        savedItems.forEach(modelContext.delete)
        watchTerms.forEach(modelContext.delete)
        do {
            try modelContext.save()
        } catch {
            modelContext.rollback()
            localDataMessage = "Beanstalk couldn't clear the saved data. Try again."
            return
        }
        localDataMessage = "Saved recalls and watch terms were cleared from this iPhone."
        Task { await notifications.syncWatchlist(terms: []) }
    }
}
