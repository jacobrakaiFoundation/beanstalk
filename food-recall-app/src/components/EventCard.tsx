import { eventSearchText } from "../lib/events";
import { formatRecallDate, toISODate } from "../lib/formatDate";
import { matchesWatchlist } from "../lib/watchlist";
import type { AdverseEvent } from "../types/event";
import { FDA_EVENT_DISCLAIMER } from "../types/event";

interface Props {
  event: AdverseEvent;
  onSelect: (e: AdverseEvent) => void;
  isNew: boolean;
  watchlist: string[];
}

/** Same accessible-card pattern as RecallCard: one named title button stretched over the card. */
export default function EventCard({ event, onSelect, isNew, watchlist }: Props) {
  const brandNames =
    event.products
      .map((p) => p.nameBrand)
      .filter(Boolean)
      .join(", ") || "Unknown product";
  const matchedTerms = matchesWatchlist(eventSearchText(event), watchlist);
  const topReactions = event.reactions.slice(0, 3);
  const topOutcomes = event.outcomes.slice(0, 2);

  return (
    <article className="panel recall-card relative flex flex-col gap-3 border-l-4 border-l-violet-500 p-4 hover:border-zinc-300 hover:shadow-md has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-violet-600 has-[:focus-visible]:ring-offset-2 dark:border-l-violet-500 dark:hover:border-zinc-700 dark:has-[:focus-visible]:ring-offset-zinc-950 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="chip chip-signal font-semibold">Early signal</span>
          <span className="chip chip-neutral">Unverified</span>
          {event.consumer.gender && <span className="chip chip-neutral">{event.consumer.gender}</span>}
          {isNew && (
            <span className="chip chip-info" title="Report started within the last 30 days">
              Last 30 days
            </span>
          )}
        </div>
        <time
          className="shrink-0 pt-0.5 text-xs text-zinc-500 dark:text-zinc-400"
          dateTime={toISODate(event.dateStarted)}
        >
          {formatRecallDate(event.dateStarted)}
        </time>
      </div>

      <div className="space-y-1">
        <h3 className="text-base font-semibold leading-snug text-zinc-900 dark:text-zinc-50">
          <button
            type="button"
            onClick={() => onSelect(event)}
            aria-label={`View adverse event report ${event.reportNumber}: ${brandNames}`}
            className="block w-full cursor-pointer text-left focus:outline-hidden after:absolute after:inset-0 after:content-['']"
          >
            <span className="line-clamp-2">{brandNames}</span>
          </button>
        </h3>
        {topReactions.length > 0 && (
          <p className="line-clamp-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            Reactions: {topReactions.join(", ")}
            {event.reactions.length > 3 ? "…" : ""}
          </p>
        )}
      </div>

      <dl className="mt-auto space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
        {topOutcomes.length > 0 && (
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-zinc-500 dark:text-zinc-400">Outcomes</dt>
            <dd className="truncate">
              {topOutcomes.join(", ")}
              {event.outcomes.length > 2 ? "…" : ""}
            </dd>
          </div>
        )}
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-zinc-500 dark:text-zinc-400">Report</dt>
          <dd className="truncate">{event.reportNumber || "—"}</dd>
        </div>
      </dl>

      {matchedTerms.length > 0 && (
        <ul
          className="flex flex-wrap gap-1.5 border-t border-zinc-100 pt-3 dark:border-zinc-800"
          aria-label="Matches your watchlist"
        >
          {matchedTerms.map((term) => (
            <li key={`watch-${term}`} className="chip chip-personal">
              Watching: {term}
            </li>
          ))}
        </ul>
      )}
      <p className="hint border-t border-zinc-100 pt-3 text-violet-800 dark:border-zinc-800 dark:text-violet-300">
        {FDA_EVENT_DISCLAIMER}
      </p>
    </article>
  );
}
