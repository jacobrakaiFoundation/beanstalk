import XCTest

/// Captures the recall list, one enforcement record, and Settings with the
/// disclaimer that ships today. The test does not change any app copy.
final class ReleaseVerifyUITests: XCTestCase {
    private let screenshotDirectory = URL(fileURLWithPath: "/tmp/beanstalk-screenshots", isDirectory: true)

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testRecallListDetailAndSettingsDisclaimer() throws {
        let app = XCUIApplication()
        app.launch()

        XCTAssertTrue(app.navigationBars["Recalls"].waitForExistence(timeout: 30))

        let row = try recallRow(in: app)
        try reveal(row, in: app)
        saveScreenshot("01-recall-list.png")

        row.tap()
        XCTAssertTrue(app.navigationBars["Enforcement record"].waitForExistence(timeout: 15))
        saveScreenshot("02-recall-detail.png")

        try openTab("Settings", in: app)
        XCTAssertTrue(app.navigationBars["Settings"].waitForExistence(timeout: 10))
        let disclaimer = app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "not affiliated with or endorsed by FDA or USDA FSIS")
        ).firstMatch
        try reveal(disclaimer, in: app)
        saveScreenshot("03-settings-disclaimer.png")
    }

    private func recallRow(in app: XCUIApplication) throws -> XCUIElement {
        let predicate = NSPredicate(format: "label CONTAINS %@", "As published by openFDA")
        let deadline = Date().addingTimeInterval(90)
        while Date() < deadline {
            let cell = app.cells.matching(predicate).firstMatch
            if cell.exists { return cell }
            let button = app.buttons.matching(predicate).firstMatch
            if button.exists { return button }
            RunLoop.current.run(until: Date().addingTimeInterval(1))
        }
        XCTFail("Recall list did not show an openFDA enforcement row")
        throw ReleaseVerifyUIError.missingRecallRow
    }

    private func openTab(_ name: String, in app: XCUIApplication) throws {
        let tab = app.tabBars.buttons[name]
        if tab.waitForExistence(timeout: 5) {
            tab.tap()
            return
        }
        let button = app.buttons[name]
        XCTAssertTrue(button.waitForExistence(timeout: 5), "Missing \(name) tab")
        button.tap()
    }

    private func reveal(_ element: XCUIElement, in app: XCUIApplication) throws {
        if element.exists, element.isHittable { return }
        for _ in 0..<8 {
            app.swipeUp()
            if element.exists, element.isHittable { return }
        }
        XCTAssertTrue(element.exists && element.isHittable, "Could not bring \(element) on screen")
    }

    private func saveScreenshot(_ name: String, file: StaticString = #filePath, line: UInt = #line) {
        let shot = XCUIScreen.main.screenshot()
        let attachment = XCTAttachment(screenshot: shot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)

        do {
            try FileManager.default.createDirectory(at: screenshotDirectory, withIntermediateDirectories: true)
            try shot.pngRepresentation.write(to: screenshotDirectory.appendingPathComponent(name))
        } catch {
            XCTFail("Could not write \(name): \(error)", file: file, line: line)
        }
    }
}

private enum ReleaseVerifyUIError: Error {
    case missingRecallRow
}
