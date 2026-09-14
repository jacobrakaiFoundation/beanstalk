import XCTest
@testable import BeanstalkCore

final class WatchMatcherTests: XCTestCase {
    func testExactWordBoundariesPreventPartialMatches() {
        XCTAssertTrue(WatchMatcher.contains(term: "salmonella", in: "Possible Salmonella contamination"))
        XCTAssertFalse(WatchMatcher.contains(term: "salmon", in: "Possible salmonella contamination"))
        XCTAssertTrue(WatchMatcher.contains(term: "cod", in: "Frozen cod portions"))
        XCTAssertFalse(WatchMatcher.contains(term: "cod", in: "Incorrect code printed on label"))
        XCTAssertFalse(WatchMatcher.contains(term: "code", in: "Frozen cod portions"))
    }

    func testPhraseIsCaseInsensitiveAndExact() {
        XCTAssertTrue(WatchMatcher.contains(term: "Peanut Butter", in: "PEANUT BUTTER cups"))
        XCTAssertFalse(WatchMatcher.contains(term: "peanut butter", in: "peanut brittle and butter"))
    }

    func testTermsAreNormalizedLikeTheNotificationService() {
        XCTAssertEqual(WatchMatcher.normalizeTerm("  MILK   Chocolate "), "milk chocolate")
        XCTAssertEqual(WatchMatcher.normalizeTerm("ＡＢＣ"), "abc")
        XCTAssertEqual(WatchMatcher.normalizeTerm("ＭＩＬＫ"), WatchMatcher.normalizeTerm("milk"))
    }

    func testMatchesExposeTermFieldAndSourceEvidence() {
        let matches = WatchMatcher.matches(
            terms: ["milk"],
            fields: [
                WatchField(name: "reason", text: "Undeclared milk allergen"),
                WatchField(name: "company", text: "Acme Foods")
            ]
        )

        XCTAssertEqual(matches, [WatchMatch(term: "milk", field: "reason", evidence: "Undeclared milk allergen")])
    }
}
