import XCTest
@testable import BeanstalkCore

final class ResponseGenerationGateTests: XCTestCase {
    func testOlderSearchResponseIsRejectedAfterNewGenerationStarts() {
        var gate = ResponseGenerationGate()
        let milk = gate.begin(signature: "latest|milk||", pageKey: "first")
        let cheese = gate.begin(signature: "latest|cheese||", pageKey: "first")

        XCTAssertFalse(gate.accepts(milk, currentSignature: "latest|cheese||"))
        XCTAssertTrue(gate.accepts(cheese, currentSignature: "latest|cheese||"))
    }

    func testResponseIsRejectedWhenVisibleFiltersChangedBeforeNextRequestStarts() {
        var gate = ResponseGenerationGate()
        let ticket = gate.begin(signature: "historical|milk|Class I|Ongoing", pageKey: "page:2")

        XCTAssertFalse(gate.accepts(ticket, currentSignature: "historical|milk|Class II|Ongoing"))
    }

    func testOlderPageIsRejectedWhenAReplacementPageStartsForSameSearch() {
        var gate = ResponseGenerationGate()
        let nextPage = gate.begin(signature: "latest|milk||", pageKey: "cursor:next")
        let refreshedFirstPage = gate.begin(signature: "latest|milk||", pageKey: "cursor:first")

        XCTAssertFalse(gate.accepts(nextPage, currentSignature: "latest|milk||"))
        XCTAssertTrue(gate.accepts(refreshedFirstPage, currentSignature: "latest|milk||"))
    }
}
