import Foundation

public enum OpenFDAMapper {
    private static let knownClassifications = Set(["Class I", "Class II", "Class III", "Not Yet Classified"])

    public static func map(_ source: OpenFDARecordDTO, retrievedAt: Date) -> EnforcementRecord {
        let recallNumber = source.recallNumber?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let eventID = source.eventID?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let rawClassification = source.classification
        let rawStatus = source.status
        let classification = normalizedClassification(rawClassification)
        let status = normalizedValue(rawStatus)
        let identity = recallNumber.isEmpty
            ? "source:\(eventID)|\(source.productDescription ?? "")|\(source.codeInfo ?? "")"
            : recallNumber

        return EnforcementRecord(
            id: identity,
            recallNumber: recallNumber,
            eventID: eventID,
            productDescription: source.productDescription ?? "",
            reasonForRecall: source.reasonForRecall ?? "",
            classification: classification,
            rawClassification: rawClassification,
            status: status,
            rawStatus: rawStatus,
            distributionPattern: source.distributionPattern ?? "",
            recallingFirm: source.recallingFirm ?? "",
            city: source.city ?? "",
            state: source.state ?? "",
            country: source.country ?? "",
            publicationDate: source.reportDate ?? "",
            recallInitiationDate: source.recallInitiationDate ?? "",
            retrievedAt: retrievedAt,
            productType: source.productType ?? "",
            codeInfo: source.codeInfo ?? "",
            moreCodeInfo: source.moreCodeInfo ?? "",
            voluntaryMandated: source.voluntaryMandated ?? "",
            address1: source.address1 ?? "",
            address2: source.address2 ?? "",
            postalCode: source.postalCode ?? "",
            centerClassificationDate: source.centerClassificationDate ?? "",
            initialFirmNotification: source.initialFirmNotification ?? "",
            productQuantity: source.productQuantity ?? "",
            terminationDate: source.terminationDate ?? ""
        )
    }

    public static func map(_ response: OpenFDAResponse, retrievedAt: Date) -> EnforcementRecordPage {
        EnforcementRecordPage(
            items: response.results.map { map($0, retrievedAt: retrievedAt) },
            total: response.meta.results.total,
            skip: response.meta.results.skip,
            limit: response.meta.results.limit
        )
    }

    private static func normalizedClassification(_ value: String?) -> String {
        guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines),
              knownClassifications.contains(trimmed) else { return "Unknown" }
        return trimmed
    }

    private static func normalizedValue(_ value: String?) -> String {
        guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else {
            return "Unknown"
        }
        return trimmed
    }
}

public enum SourceDateFormatter {
    private static let compact: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyyMMdd"
        return formatter
    }()

    private static let iso8601: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    private static let iso8601Fractional: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    public static func date(from sourceValue: String) -> Date? {
        if let compactDate = compact.date(from: sourceValue) { return compactDate }
        if let fractionalDate = iso8601Fractional.date(from: sourceValue) { return fractionalDate }
        return iso8601.date(from: sourceValue)
    }

    public static func display(_ sourceValue: String) -> String {
        guard !sourceValue.isEmpty else { return "Not provided" }
        if let date = date(from: sourceValue) {
            return date.formatted(date: .abbreviated, time: .omitted)
        }
        return sourceValue
    }
}
