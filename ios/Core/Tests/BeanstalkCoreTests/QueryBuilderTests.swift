import XCTest
@testable import BeanstalkCore

final class QueryBuilderTests: XCTestCase {
    func testNoticeQueryPreservesCursorAndSanitizesSearch() throws {
        let url = try NoticeRequestBuilder.listURL(
            baseURL: URL(string: "https://api.beanstalk.jacobrakai.org")!,
            limit: 25,
            cursor: "next/page==",
            query: "  milk \"bar\"\\  "
        )
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let values = Dictionary(uniqueKeysWithValues: (components?.queryItems ?? []).map { ($0.name, $0.value ?? "") })

        XCTAssertEqual(url.path, "/v1/notices")
        XCTAssertEqual(values["limit"], "25")
        XCTAssertEqual(values["cursor"], "next/page==")
        XCTAssertEqual(values["query"], "milk bar")
    }

    func testOpenFDAFiltersAreServerSideBeforePagination() throws {
        let request = EnforcementSearch(
            query: "peanut butter",
            classification: "Class I",
            status: "Ongoing",
            limit: 20,
            page: 3
        )
        let url = try OpenFDARequestBuilder.url(for: request)
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let values = Dictionary(uniqueKeysWithValues: (components?.queryItems ?? []).map { ($0.name, $0.value ?? "") })
        let search = try XCTUnwrap(values["search"])

        XCTAssertTrue(search.contains("product_description:\"peanut butter\""))
        XCTAssertTrue(search.contains("reason_for_recall:\"peanut butter\""))
        XCTAssertTrue(search.contains("recalling_firm:\"peanut butter\""))
        XCTAssertTrue(search.contains("classification:\"Class I\""))
        XCTAssertTrue(search.contains("status:\"Ongoing\""))
        XCTAssertEqual(values["limit"], "20")
        XCTAssertEqual(values["skip"], "60")
        XCTAssertEqual(values["sort"], "report_date:desc")
        XCTAssertEqual(url.host, "api.fda.gov")
        XCTAssertFalse(url.absoluteString.contains("api.beanstalk.jacobrakai.org"))
    }

    func testOpenFDARejectsPaginationPastAPIWindow() {
        XCTAssertThrowsError(try OpenFDARequestBuilder.url(for: EnforcementSearch(limit: 100, page: 251))) {
            XCTAssertEqual($0 as? QueryBuilderError, .offsetBeyondOpenFDALimit)
        }
    }
}
