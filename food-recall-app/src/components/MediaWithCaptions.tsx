/**
 * MediaWithCaptions — reusable pattern for captions + audio descriptions.
 * Beanstalk is text-only today (FDA records + CAERS), but any future
 * <video> or <audio> MUST use this component so VoiceOver, captions,
 * and audio descriptions are claimable on iPhone.
 *
 * Props cover the App Store checklist:
 * - captions track (WebVTT) -> Captions feature
 * - transcript -> Audio Descriptions fallback + non-visual alternative
 * - controls + keyboard accessible -> VoiceOver / Voice Control
 * - respects prefers-reduced-motion for auto-play
 */
interface Props {
  src: string;
  type: "video" | "audio";
  captionsSrc: string;
  captionsLabel?: string;
  transcript?: string;
  poster?: string;
  title: string;
}

export default function MediaWithCaptions({
  src,
  type,
  captionsSrc,
  captionsLabel = "English captions",
  transcript,
  poster,
  title,
}: Props) {
  if (type === "audio") {
    return (
      <div className="space-y-2">
        <audio controls preload="metadata" aria-label={title} className="w-full">
          <source src={src} />
          <track kind="captions" src={captionsSrc} srcLang="en" label={captionsLabel} default />
          Your browser does not support audio playback. {transcript && `Transcript: ${transcript}`}
        </audio>
        {transcript && (
          <details className="hint">
            <summary>Transcript</summary>
            <p className="mt-1 whitespace-pre-wrap">{transcript}</p>
          </details>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <video
        controls
        preload="metadata"
        poster={poster}
        aria-label={title}
        className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800"
      >
        <source src={src} />
        <track kind="captions" src={captionsSrc} srcLang="en" label={captionsLabel} default />
        {/* Audio description track when provided as separate captions file */}
        Your browser does not support video playback. {transcript && `Transcript: ${transcript}`}
      </video>
      {transcript && (
        <details className="hint">
          <summary>Transcript and audio description</summary>
          <p className="mt-1 whitespace-pre-wrap">{transcript}</p>
        </details>
      )}
    </div>
  );
}
