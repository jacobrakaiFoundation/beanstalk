import Foundation

public struct WatchField: Codable, Hashable, Sendable {
    public let name: String
    public let text: String

    public init(name: String, text: String) {
        self.name = name
        self.text = text
    }
}

public struct WatchMatch: Codable, Hashable, Identifiable, Sendable {
    public var id: String { "\(term)|\(field)|\(evidence)" }
    public let term: String
    public let field: String
    public let evidence: String

    public init(term: String, field: String, evidence: String) {
        self.term = term
        self.field = field
        self.evidence = evidence
    }
}

public enum WatchMatcher {
    public static func normalizeTerm(_ term: String) -> String {
        term.precomposedStringWithCompatibilityMapping
            .lowercased(with: Locale(identifier: "en_US_POSIX"))
            .split(whereSeparator: { $0.isWhitespace })
            .joined(separator: " ")
    }

    public static func contains(term rawTerm: String, in text: String) -> Bool {
        let term = normalizeTerm(rawTerm)
        guard !term.isEmpty, !text.isEmpty else { return false }
        let normalizedText = text.precomposedStringWithCompatibilityMapping
            .lowercased(with: Locale(identifier: "en_US_POSIX"))
        let escaped = NSRegularExpression.escapedPattern(for: term)
        let pattern = "(?<![\\p{L}\\p{N}\\p{M}])\(escaped)(?![\\p{L}\\p{N}\\p{M}])"
        guard let expression = try? NSRegularExpression(
            pattern: pattern,
            options: [.caseInsensitive, .useUnicodeWordBoundaries]
        ) else { return false }
        let range = NSRange(normalizedText.startIndex..<normalizedText.endIndex, in: normalizedText)
        return expression.firstMatch(in: normalizedText, range: range) != nil
    }

    public static func matches(terms: [String], fields: [WatchField]) -> [WatchMatch] {
        var results: [WatchMatch] = []
        for rawTerm in terms {
            let term = normalizeTerm(rawTerm)
            guard !term.isEmpty else { continue }
            for field in fields where contains(term: term, in: field.text) {
                results.append(WatchMatch(term: term, field: field.name, evidence: field.text))
            }
        }
        return results
    }
}
