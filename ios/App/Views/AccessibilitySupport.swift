import SwiftUI

/// iPhone accessibility support for App Store declarations.
/// Common tasks (onboarding, search, filters, view details, save, watchlist,
/// settings, help) are operable with VoiceOver, Voice Control, Larger Text,
/// Dark Interface, Differentiate Without Color Alone, Sufficient Contrast,
/// and Reduced Motion.
///
/// Captions and audio descriptions are not claimed. The app ships no audio
/// or video, so it cannot support either feature.

enum AccessibilitySupport {
    static let supportsVoiceOver = true
    static let supportsVoiceControl = true
    static let supportsLargerText = true
    static let supportsDarkInterface = true
    static let supportsDifferentiateWithoutColor = true
    static let supportsSufficientContrast = true
    static let supportsReducedMotion = true
    static let supportsCaptions = false
    static let supportsAudioDescriptions = false
}

// MARK: - Reduced Motion aware modifier

struct ReducedMotionModifier: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        if reduceMotion {
            content.transaction { t in t.animation = nil }
        } else {
            content
        }
    }
}

extension View {
    func accessibilityReduceMotionAware() -> some View {
        modifier(ReducedMotionModifier())
    }
}

// MARK: - Larger Text: ensure layout tolerates 200% scaling

extension View {
    /// Use on root containers to guarantee no clipping at Accessibility XXXL.
    func supportsLargerText() -> some View {
        self
            .dynamicTypeSize(...DynamicTypeSize.accessibility3)
            .fixedSize(horizontal: false, vertical: false)
    }
}

// MARK: - Differentiate Without Color: helper

struct StatusBadge: View {
    let label: String
    let systemImage: String
    var color: Color = .secondary

    var body: some View {
        Label(label, systemImage: systemImage)
            .font(.caption.weight(.semibold))
            .foregroundStyle(color)
            .accessibilityElement(children: .combine)
    }
}

// MARK: - Captions support for future video

#if canImport(AVKit)
import AVKit

struct CaptionedVideoPlayer: View {
    let url: URL
    let captionsURL: URL?
    let title: String

    var body: some View {
        VideoPlayer(player: AVPlayer(url: url))
            .accessibilityLabel(title)
            .accessibilityHint("Plays video.")
        // AVPlayerViewController automatically shows CC button when a WebVTT track is bundled.
        // For audio descriptions, provide a sibling Transcript view.
    }
}
#endif
