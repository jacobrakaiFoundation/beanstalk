import Foundation

/// A current public FDA recall announcement supplied by the Beanstalk service.
/// Optional structured fields remain optional because some FDA announcements only
/// provide the corresponding wording in `summary`.
public struct RecallNotice: Codable, Hashable, Identifiable, Sendable {
    public let id: String
    public let title: String
    public let summary: String
    public let productDescription: String?
    public let reasonForRecall: String?
    public let companyName: String?
    public let classification: String?
    public let status: String?
    public let distribution: String?
    public let codeInfo: String?
    public let publicationDate: String
    public let recallInitiationDate: String?
    public let retrievedAt: String
    public let sourceURL: URL

    public init(
        id: String,
        title: String,
        summary: String,
        productDescription: String? = nil,
        reasonForRecall: String? = nil,
        companyName: String? = nil,
        classification: String? = nil,
        status: String? = nil,
        distribution: String? = nil,
        codeInfo: String? = nil,
        publicationDate: String,
        recallInitiationDate: String? = nil,
        retrievedAt: String,
        sourceURL: URL
    ) {
        self.id = id
        self.title = title
        self.summary = summary
        self.productDescription = productDescription
        self.reasonForRecall = reasonForRecall
        self.companyName = companyName
        self.classification = classification
        self.status = status
        self.distribution = distribution
        self.codeInfo = codeInfo
        self.publicationDate = publicationDate
        self.recallInitiationDate = recallInitiationDate
        self.retrievedAt = retrievedAt
        self.sourceURL = sourceURL
    }

    public var searchableFields: [WatchField] {
        [
            WatchField(name: "title", text: title),
            WatchField(name: "summary", text: summary),
            WatchField(name: "product", text: productDescription ?? ""),
            WatchField(name: "reason", text: reasonForRecall ?? ""),
            WatchField(name: "company", text: companyName ?? ""),
            WatchField(name: "distribution", text: distribution ?? ""),
            WatchField(name: "lot or code", text: codeInfo ?? "")
        ]
    }
}

public struct RecallNoticePage: Codable, Equatable, Sendable {
    public let items: [RecallNotice]
    public let nextCursor: String?

    public init(items: [RecallNotice], nextCursor: String?) {
        self.items = items
        self.nextCursor = nextCursor
    }
}

/// A historical enforcement snapshot, kept distinct from current announcements.
public struct EnforcementRecord: Codable, Hashable, Identifiable, Sendable {
    public let id: String
    public let recallNumber: String
    public let eventID: String
    public let productDescription: String
    public let reasonForRecall: String
    public let classification: String
    public let rawClassification: String?
    public let status: String
    public let rawStatus: String?
    public let distributionPattern: String
    public let recallingFirm: String
    public let city: String
    public let state: String
    public let country: String
    public let publicationDate: String
    public let recallInitiationDate: String
    public let retrievedAt: Date
    public let productType: String
    public let codeInfo: String
    public let moreCodeInfo: String
    public let voluntaryMandated: String
    public let address1: String
    public let address2: String
    public let postalCode: String
    public let centerClassificationDate: String
    public let initialFirmNotification: String
    public let productQuantity: String
    public let terminationDate: String

    public var sourceURL: URL {
        var components = URLComponents(string: "https://api.fda.gov/food/enforcement.json")!
        if !recallNumber.isEmpty {
            components.queryItems = [URLQueryItem(name: "search", value: "recall_number:\"\(recallNumber)\"")]
        } else if !eventID.isEmpty {
            components.queryItems = [URLQueryItem(name: "search", value: "event_id:\"\(eventID)\"")]
        }
        return components.url!
    }

    public var searchableFields: [WatchField] {
        [
            WatchField(name: "product", text: productDescription),
            WatchField(name: "reason", text: reasonForRecall),
            WatchField(name: "company", text: recallingFirm),
            WatchField(name: "distribution", text: distributionPattern),
            WatchField(name: "lot or code", text: [codeInfo, moreCodeInfo].joined(separator: " "))
        ]
    }
}

public struct OpenFDAResponse: Codable, Equatable, Sendable {
    public struct Metadata: Codable, Equatable, Sendable {
        public struct Results: Codable, Equatable, Sendable {
            public let skip: Int
            public let limit: Int
            public let total: Int
        }

        public let results: Results
    }

    public let meta: Metadata
    public let results: [OpenFDARecordDTO]
}

public struct OpenFDARecordDTO: Codable, Equatable, Sendable {
    public let recallNumber: String?
    public let eventID: String?
    public let productDescription: String?
    public let reasonForRecall: String?
    public let classification: String?
    public let status: String?
    public let distributionPattern: String?
    public let recallingFirm: String?
    public let city: String?
    public let state: String?
    public let country: String?
    public let recallInitiationDate: String?
    public let reportDate: String?
    public let productType: String?
    public let codeInfo: String?
    public let moreCodeInfo: String?
    public let voluntaryMandated: String?
    public let address1: String?
    public let address2: String?
    public let postalCode: String?
    public let centerClassificationDate: String?
    public let initialFirmNotification: String?
    public let productQuantity: String?
    public let terminationDate: String?

    enum CodingKeys: String, CodingKey {
        case recallNumber = "recall_number"
        case eventID = "event_id"
        case productDescription = "product_description"
        case reasonForRecall = "reason_for_recall"
        case classification, status
        case distributionPattern = "distribution_pattern"
        case recallingFirm = "recalling_firm"
        case city, state, country
        case recallInitiationDate = "recall_initiation_date"
        case reportDate = "report_date"
        case productType = "product_type"
        case codeInfo = "code_info"
        case moreCodeInfo = "more_code_info"
        case voluntaryMandated = "voluntary_mandated"
        case address1 = "address_1"
        case address2 = "address_2"
        case postalCode = "postal_code"
        case centerClassificationDate = "center_classification_date"
        case initialFirmNotification = "initial_firm_notification"
        case productQuantity = "product_quantity"
        case terminationDate = "termination_date"
    }
}

public struct EnforcementRecordPage: Codable, Equatable, Sendable {
    public let items: [EnforcementRecord]
    public let total: Int
    public let skip: Int
    public let limit: Int

    public init(items: [EnforcementRecord], total: Int, skip: Int, limit: Int) {
        self.items = items
        self.total = total
        self.skip = skip
        self.limit = limit
    }

    public var hasMore: Bool { skip + items.count < total && skip + items.count <= 25_000 }
}
