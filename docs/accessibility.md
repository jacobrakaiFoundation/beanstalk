# Beanstalk iPhone Accessibility — App Store Declaration

Both targets are claimable for all 9 features: `food-recall-app` (Capacitor web → WKWebView) and `ios/Beanstalk` native SwiftUI.

## Web (food-recall-app)

| Feature | Implementation | Verify |
|---|---|---|
| **VoiceOver** | Skip link, landmarks (`header`, `main#main-content`, `aside[aria-label]`, `footer`), `role=tablist/tab/tabpanel`, `aria-live=polite` for counts, `role=dialog aria-modal` with focus trap in `RecallDetail.tsx:129`, `aria-label` on cards (`RecallCard.tsx:58`), labels on every select/checkbox. | VoiceOver swipe: search → filter → open card → detail → close → pagination |
| **Voice Control** | Visible labels match accessible names: `Search`, `Classification`, `Status`, `Source`, `Distribution State`, quick-filter buttons have visible text = spoken name. Clear button has `aria-label=Clear search`. | Voice Control “Tap Search” / “Tap High risk” |
| **Larger Text** | `html{font-size:100%; text-size-adjust:100%}`, Tailwind uses `rem`, no fixed heights that clip, `overflow-wrap:break-word`, `fixedSize(horizontal:false)` on banners. Supports 200% Safari zoom and iOS text scaling. | Settings > Larger Text AX5 + Safari zoom 200% |
| **Dark Interface** | `@custom-variant dark`, `html.dark {color-scheme:dark}`, `color-scheme` meta, `theme-color` light/dark, Tailwind `dark:` variants throughout. | Dark toggle in header + system dark |
| **Differentiate Without Color** | `RiskBadge` shows word + class (`Class I` + “High”), `chip chip-info/neutral` have distinct `ring` + text, enforcement `border-l-4` + label. Not color alone. | Grayscale mode still readable |
| **Sufficient Contrast** | Tokens: `zinc-700 #3d503d` on `paper #fffdf7` ~10:1, `zinc-500` on `zinc-50` ~5.8:1, dark: `zinc-300` on `zinc-950` passes. Focus ring `3px #059669`. | Contrast tool passes AA |
| **Reduced Motion** | `RecallDetail` motion-reduce:animate-none, `prefers-reduced-motion:reduce` zeros durations + `scroll-behavior:auto`, hover translate only under `prefers-reduced-motion:no-preference`. | Reduce Motion ON → no slide/hover |
| **Captions** | No shipped video. `MediaWithCaptions.tsx` enforces `<track kind="captions" srclang=en default>` + transcript for any future `<video>/<audio>`. `video::cue` styled for contrast. | Add `<MediaWithCaptions captionsSrc=…>` → CC button |
| **Audio Descriptions** | Same component: transcript + `kind=descriptions` track option. All information also available as text. | Verify transcript detail disclosed |

## Native iOS (SwiftUI)

`ios/App/Views/AccessibilitySupport.swift` documents declarations. `RootView` adds:

- `accessibilityLabel` on each tab + `supportsLargerText()` (`dynamicTypeSize ... accessibility3`, no clipping)
- `accessibilityReduceMotionAware()` zeros animations when `accessibilityReduceMotion` is true
- `InformationBanner`, `EnforcementRow`, `NoticeRow`, save buttons all have `accessibilityElement(children:.combine)` + hints
- List/ScrollView layouts flex for AX sizes; Dark Interface via asset catalog (`AccentColor`, colorScheme); contrast meets AA via system colors + `secondary` styles
- Captions prepared via `CaptionedVideoPlayer` (AVPlayerViewController `closedCaptionDisplayEnabled` + WebVTT)

## Verification checklist (iPhone)

1. VoiceOver ON: Tab through Recalls/Saved/Watchlist/Settings → search → filter sheet → save → detail → share.
2. Voice Control ON: “Tap Recalls”, “Tap Search field”, “Tap High risk”.
3. Larger Text AX5 + Landscape: no truncation in cards, detail `SourceFact` wraps, tab bar remains tappable 44pt.
4. Dark Mode + Reduce Motion + Grayscale toggles all reflect without restart.
5. If adding video: verify CC button and transcript appear.
