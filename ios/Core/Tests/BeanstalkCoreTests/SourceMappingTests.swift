import XCTest
@testable import BeanstalkCore

final class SourceMappingTests: XCTestCase {
    func testMappingKeepsPublicationInitiationAndRetrievalDatesDistinct() throws {
        let json = #"""
        {
          "recall_number":"F-100-2026",
          "event_id":"10001",
          "product_description":"Acme tahini, lot 7",
          "reason_for_recall":"Potential Salmonella contamination",
          "classification":"Class I",
          "status":"Ongoing",
          "recall_initiation_date":"20260801",
          "report_date":"20260814",
          "code_info":"LOT 7"
        }
        """#.data(using: .utf8)!
        let source = try JSONDecoder().decode(OpenFDARecordDTO.self, from: json)
        let retrieval = Date(timeIntervalSince1970: 1_788_000_000)
        let mapped = OpenFDAMapper.map(source, retrievedAt: retrieval)

        XCTAssertEqual(mapped.publicationDate, "20260814")
        XCTAssertEqual(mapped.recallInitiationDate, "20260801")
        XCTAssertEqual(mapped.retrievedAt, retrieval)
        XCTAssertEqual(mapped.productDescription, "Acme tahini, lot 7")
        XCTAssertEqual(mapped.reasonForRecall, "Potential Salmonella contamination")
        XCTAssertEqual(mapped.codeInfo, "LOT 7")
    }

    func testUnknownSourceValuesArePreservedBesideNormalizedDisplayValues() throws {
        let data = #"{"classification":"Pending review","status":"","product_description":"Product"}"#.data(using: .utf8)!
        let source = try JSONDecoder().decode(OpenFDARecordDTO.self, from: data)
        let mapped = OpenFDAMapper.map(source, retrievedAt: Date())

        XCTAssertEqual(mapped.classification, "Unknown")
        XCTAssertEqual(mapped.rawClassification, "Pending review")
        XCTAssertEqual(mapped.status, "Unknown")
        XCTAssertEqual(mapped.rawStatus, "")
    }

    func testRecallNoticeDecodesNullableStructuredFields() throws {
        let data = #"""
        {
          "id":"notice-1",
          "title":"FDA announcement title",
          "summary":"Complete source wording remains available here.",
          "productDescription":null,
          "reasonForRecall":null,
          "companyName":null,
          "classification":null,
          "status":null,
          "distribution":null,
          "codeInfo":null,
          "publicationDate":"2026-09-12T18:00:00Z",
          "recallInitiationDate":null,
          "retrievedAt":"2026-09-13T18:00:00Z",
          "sourceURL":"https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts/example"
        }
        """#.data(using: .utf8)!
        let notice = try JSONDecoder().decode(RecallNotice.self, from: data)

        XCTAssertEqual(notice.title, "FDA announcement title")
        XCTAssertEqual(notice.summary, "Complete source wording remains available here.")
        XCTAssertNil(notice.productDescription)
    }

    func testSourceDateFormatterParsesISO8601WithAndWithoutFractionalSeconds() throws {
        let wholeSeconds = try XCTUnwrap(SourceDateFormatter.date(from: "2026-09-13T18:00:00Z"))
        let fractionalSeconds = try XCTUnwrap(SourceDateFormatter.date(from: "2026-09-13T18:00:00.000Z"))

        XCTAssertEqual(wholeSeconds, fractionalSeconds)
        XCTAssertEqual(
            SourceDateFormatter.display("2026-09-13T18:00:00Z"),
            SourceDateFormatter.display("2026-09-13T18:00:00.000Z")
        )
    }

    func testSourceDateFormatterKeepsCompactFDACalendarDatesInWesternTimeZones() {
        let originalTimeZone = NSTimeZone.default
        NSTimeZone.default = TimeZone(identifier: "America/Los_Angeles")!
        defer { NSTimeZone.default = originalTimeZone }

        XCTAssertEqual(SourceDateFormatter.display("20260913"), "Sep 13, 2026")
        XCTAssertEqual(SourceDateFormatter.display("20260101"), "Jan 1, 2026")
    }
}
