import Foundation

enum AppConfiguration {
    static let backendBaseURL: URL = {
        let configured = Bundle.main.object(forInfoDictionaryKey: "BEANSTALK_BACKEND_BASE_URL") as? String
        return URL(string: configured ?? "") ?? URL(string: "https://api.beanstalk.jacobrakai.org")!
    }()

    static let apnsEnvironment: String = {
        let configured = Bundle.main.object(forInfoDictionaryKey: "APNS_ENVIRONMENT") as? String
        return configured == "production" ? "production" : "sandbox"
    }()

    static let privacyURL = URL(string: "https://jacobrakaifoundation.github.io/beanstalk/privacy.html")!
    static let supportURL = URL(string: "https://jacobrakaifoundation.github.io/beanstalk/support.html")!
    static let donationURL = URL(string: "https://jacobrakai.org/donate/")!
}
