import Foundation
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

NSTimeZone.default = TimeZone(identifier: "America/Los_Angeles")!
print("default timezone:", TimeZone.current.identifier)
for input in ["20260913", "20260101", "20260913T12:00:00Z"] { print(input, "=>", SourceDateFormatter.display(input)) }
