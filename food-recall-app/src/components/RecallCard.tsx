import { DIETARY_LABELS, type DietaryConcern, getDietaryMatches } from "../lib/dietary";
import { distributionScope } from "../lib/distributionScope";
import { formatRecallDate, toISODate } from "../lib/formatDate";
import { categorizeReason, hazardLabel } from "../lib/reasonCategory";
import { matchesWatchlist } from "../lib/watchlist";
import type { Recall } from "../types/recall";
import RiskBadge from "./RiskBadge";

interface Props {
  recall: Recall;
  onSelect: (r: Recall) => void;
  isNew: boolean;
  watchlist: string[];
  dietary?: DietaryConcern[];
}

/** Ongoing recalls get the informational tint; every other FDA status stays neutral. */
export function statusChipClass(status: string): string {
  return status.toLowerCase() === "ongoing" ? "chip chip-info" : "chip chip-neutral";
}

/**
 * Accessible card: the title is the single real button, stretched over the whole card with a
 * pseudo-element so a mouse can click anywhere while keyboard and screen-reader users get one
 * named control per recall.
 */
export default function RecallCard({ recall, onSelect, isNew, watchlist, dietary = [] }: Props) {
  const matchedTerms = matchesWatchlist(
    `${recall.productDescription} ${recall.reasonForRecall} ${recall.recallingFirm}`,
    watchlist,
  );
  const dietaryMatches = dietary.length > 0 ? getDietaryMatches(recall, dietary) : [];
  const category = categorizeReason(recall.reasonForRecall);
  const hazard = hazardLabel(recall.reasonForRecall);
  const scope = distributionScope(recall.distributionPattern);
  const hasPersonalMatch = matchedTerms.length > 0 || dietaryMatches.length > 0;
  const firmLocation = [recall.city, recall.state].filter(Boolean).join(", ");
  const firmLine = [recall.recallingFirm, firmLocation].filter(Boolean).join(" · ");
  const highRisk = recall.classification === "Class I";

  return (
    <article
      className={`panel recall-card relative flex flex-col gap-3 p-4 hover:border-zinc-300 hover:shadow-md has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-emerald-600 has-[:focus-visible]:ring-offset-2 dark:hover:border-zinc-700 dark:has-[:focus-visible]:ring-offset-zinc-950 sm:p-5 ${
        highRisk ? "border-l-4 border-l-red-700 dark:border-l-red-600" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <RiskBadge classification={recall.classification} showClass={true} />
          <span className={statusChipClass(recall.status)}>{recall.status}</span>
          {scope.label !== "Unclear" && (
            <span className="chip chip-neutral" title={scope.states.length > 0 ? scope.states.join(", ") : undefined}>
              {scope.label}
            </span>
          )}
          {isNew && (
            <span className="chip chip-info" title="Recall initiated within the last 30 days">
              Last 30 days
            </span>
          )}
        </div>
        <time
          className="shrink-0 pt-0.5 text-xs text-zinc-500 dark:text-zinc-400"
          dateTime={toISODate(recall.recallInitiationDate)}
        >
          {formatRecallDate(recall.recallInitiationDate)}
        </time>
      </div>

      <div className="space-y-1">
        {category && (
          <p className="flex flex-wrap items-baseline gap-x-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            <span>{category}</span>
            {hazard && <span className="normal-case tracking-normal text-zinc-800 dark:text-zinc-200">· {hazard}</span>}
          </p>
        )}
        <h3 className="text-base font-semibold leading-snug text-zinc-900 dark:text-zinc-50">
          <button
            type="button"
            onClick={() => onSelect(recall)}
            aria-label={`View recall ${recall.recallNumber}: ${recall.productDescription}`}
            className="block w-full cursor-pointer text-left focus:outline-hidden after:absolute after:inset-0 after:content-['']"
          >
            <span className="line-clamp-2">{recall.productDescription}</span>
          </button>
        </h3>
        <p className="line-clamp-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          {recall.reasonForRecall}
        </p>
      </div>

      <dl className="mt-auto space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
        <div className="flex gap-2">
          <dt className="w-14 shrink-0 text-zinc-500 dark:text-zinc-400">Firm</dt>
          <dd className="truncate">{firmLine || "Not stated"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-14 shrink-0 text-zinc-500 dark:text-zinc-400">Sold in</dt>
          <dd className="truncate">{recall.distributionPattern || "Not stated"}</dd>
        </div>
      </dl>

      {hasPersonalMatch && (
        <ul
          className="flex flex-wrap gap-1.5 border-t border-zinc-100 pt-3 dark:border-zinc-800"
          aria-label="Matches your watchlist or dietary concerns"
        >
          {matchedTerms.map((term) => (
            <li key={`watch-${term}`} className="chip chip-personal">
              Watching: {term}
            </li>
          ))}
          {dietaryMatches.map((m) => (
            <li key={`diet-${m.concern}`} className="chip chip-personal">
              {DIETARY_LABELS[m.concern]} · {m.field}: “{m.term}”
            </li>
          ))}
        </ul>
      )}
      {dietary.length > 0 && dietaryMatches.length === 0 && (
        <p className="hint border-t border-zinc-100 pt-3 dark:border-zinc-800">
          No dietary match — absence does not mean allergen-free
        </p>
      )}
    </article>
  );
}
