import XCTest
@testable import BeanstalkCore

final class BrowseRequestTests: XCTestCase {
    func testLatestSearchUsesOpenFDAPageZeroWithoutAnnouncementFilters() throws {
        let search = BrowseRequest.enforcementSearch(
            mode: .latest,
            query: "milk",
            classification: "Class I",
            status: "Ongoing",
            page: 0
        )
        XCTAssertEqual(search.query, "milk")
        XCTAssertEqual(search.classification, "")
        XCTAssertEqual(search.status, "")
        XCTAssertEqual(search.page, 0)
        XCTAssertEqual(search.limit, BrowseRequest.latestPageSize)
        XCTAssertTrue((20...30).contains(search.limit))

        let url = try OpenFDARequestBuilder.url(for: search)
        let values = queryValues(url)
        XCTAssertEqual(url.host, "api.fda.gov")
        XCTAssertEqual(url.path, "/food/enforcement.json")
        XCTAssertFalse(url.absoluteString.contains("api.beanstalk.jacobrakai.org"))
        XCTAssertEqual(values["limit"], "25")
        XCTAssertEqual(values["skip"], "0")
        XCTAssertEqual(values["sort"], "report_date:desc")
        let searchQuery = try XCTUnwrap(values["search"])
        XCTAssertTrue(searchQuery.contains("product_description:\"milk\""))
        XCTAssertFalse(searchQuery.contains("classification:"))
        XCTAssertFalse(searchQuery.contains("status:"))
    }

    func testHistoricalSearchKeepsClassAndStatusFilters() throws {
        let search = BrowseRequest.enforcementSearch(
            mode: .historical,
            query: "peanut",
            classification: "Class II",
            status: "Terminated",
            page: 3
        )
        XCTAssertEqual(search.query, "peanut")
        XCTAssertEqual(search.classification, "Class II")
        XCTAssertEqual(search.status, "Terminated")
        XCTAssertEqual(search.page, 3)
        XCTAssertEqual(search.limit, BrowseRequest.historicalPageSize)

        let url = try OpenFDARequestBuilder.url(for: search)
        let values = queryValues(url)
        let searchQuery = try XCTUnwrap(values["search"])
        XCTAssertTrue(searchQuery.contains("classification:\"Class II\""))
        XCTAssertTrue(searchQuery.contains("status:\"Terminated\""))
        XCTAssertEqual(values["skip"], "75")
        XCTAssertEqual(values["sort"], "report_date:desc")
        XCTAssertEqual(url.host, "api.fda.gov")
    }

    func testLatestApplyWritesOpenFDARecordsAndPreservesLoadMorePaging() {
        let first = record("F-001-2026")
        let firstPage = EnforcementRecordPage(
            items: [first],
            total: 40,
            skip: 0,
            limit: BrowseRequest.latestPageSize
        )
        let applied = BrowseRequest.applyEnforcement(
            existing: [],
            replacing: true,
            page: firstPage,
            requestPage: 0
        )
        XCTAssertEqual(applied.records.map(\.id), ["F-001-2026"])
        XCTAssertEqual(applied.page, 0)
        XCTAssertTrue(applied.hasMore)

        let second = record("F-002-2026")
        let more = BrowseRequest.applyEnforcement(
            existing: applied.records,
            replacing: false,
            page: EnforcementRecordPage(
                items: [second],
                total: 40,
                skip: BrowseRequest.latestPageSize,
                limit: BrowseRequest.latestPageSize
            ),
            requestPage: 1
        )
        XCTAssertEqual(more.records.map(\.id), ["F-001-2026", "F-002-2026"])
        XCTAssertEqual(more.page, 1)
        XCTAssertTrue(more.hasMore)
    }

    func testLatestBlankQueryOmitsSearchAndNeverTargetsTheBeanstalkHost() throws {
        let search = BrowseRequest.enforcementSearch(
            mode: .latest,
            query: "",
            classification: "",
            status: "",
            page: 0
        )
        let url = try OpenFDARequestBuilder.url(for: search)
        let values = queryValues(url)
        XCTAssertNil(values["search"])
        XCTAssertEqual(values["sort"], "report_date:desc")
        XCTAssertEqual(url.scheme, "https")
        XCTAssertEqual(url.host, "api.fda.gov")
        XCTAssertFalse(url.absoluteString.contains("beanstalk"))
    }

    private func queryValues(_ url: URL) -> [String: String] {
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        return Dictionary(uniqueKeysWithValues: (components?.queryItems ?? []).map { ($0.name, $0.value ?? "") })
    }

    private func record(_ id: String) -> EnforcementRecord {
        let json = Data("""
        {"recall_number":"\(id)","event_id":"1","product_description":"Milk","reason_for_recall":"Listeria","classification":"Class I","status":"Ongoing","recalling_firm":"Acme","report_date":"20260915","recall_initiation_date":"20260901"}
        """.utf8)
        let source = try! JSONDecoder().decode(OpenFDARecordDTO.self, from: json)
        return OpenFDAMapper.map(source, retrievedAt: Date(timeIntervalSince1970: 0))
    }
}
