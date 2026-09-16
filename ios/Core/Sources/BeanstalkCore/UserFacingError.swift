import Foundation

/// Maps failures to copy safe to show in the UI (no HTTP bodies or system diagnostics).
public enum UserFacingError {
    public static func network(_ error: Error, fallback: String) -> String {
        fallback
    }
}
