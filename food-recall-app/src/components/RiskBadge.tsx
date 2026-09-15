import { riskLevel } from "../lib/classification";
import type { RecallClassification } from "../types/recall";

interface Props {
  classification: RecallClassification;
  /** Show the FDA class after the risk word; false where the class is already listed nearby. */
  showClass: boolean;
}

const STYLES: Record<RecallClassification, string> = {
  "Class I": "bg-red-700 text-white ring-red-700 dark:bg-red-600 dark:ring-red-600",
  "Class II": "bg-amber-100 text-amber-900 ring-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800",
  "Class III": "bg-zinc-100 text-zinc-700 ring-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700",
  "Not Yet Classified": "bg-zinc-50 text-zinc-600 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:ring-zinc-700",
  Unknown: "bg-zinc-50 text-zinc-600 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:ring-zinc-700",
};

/** Hazard class rendered as a risk word plus the FDA class, so severity reads at a glance and the class stays verifiable. */
export default function RiskBadge({ classification, showClass }: Props) {
  const risk = riskLevel(classification);
  return (
    <span className={`chip font-semibold ${STYLES[classification]}`} title={risk.definition}>
      <span>{risk.label}</span>
      {showClass && risk.classified && (
        <>
          <span aria-hidden="true" className="font-normal opacity-70">
            ·
          </span>
          <span className="font-normal">{classification}</span>
        </>
      )}
    </span>
  );
}
