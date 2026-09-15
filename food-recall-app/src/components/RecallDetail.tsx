import { type ReactNode, useEffect, useRef } from "react";
import { riskLevel } from "../lib/classification";
import { formatRecallDate, toISODate } from "../lib/formatDate";
import { categorizeReason, hazardLabel } from "../lib/reasonCategory";
import type { AdverseEvent } from "../types/event";
import { FSIS_AS_PUBLISHED, OPENFDA_AS_PUBLISHED, type Recall } from "../types/recall";
import RelatedEvents from "./RelatedEvents";
import RiskBadge from "./RiskBadge";

interface Props {
  recall: Recall;
  onClose: () => void;
  onSelectEvent?: (event: AdverseEvent) => void;
}

interface SectionProps {
  title: string;
  children: ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <section className="space-y-2">
      <h3 className="label">{title}</h3>
      <div className="text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">{children}</div>
    </section>
  );
}

interface FactProps {
  term: string;
  children: ReactNode;
}

function Fact({ term, children }: FactProps) {
  return (
    <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-2 py-1.5">
      <dt className="text-zinc-500 dark:text-zinc-400">{term}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

interface CodeBlockProps {
  text: string;
  source: string;
}

function CodeBlock({ text, source }: CodeBlockProps) {
  return (
    <div>
      <pre
        className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-zinc-200 bg-zinc-50 p-3 font-mono text-xs text-zinc-800 select-text focus:outline-hidden focus:ring-2 focus:ring-emerald-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200"
        tabIndex={0}
      >
        {text}
      </pre>
      <p className="hint mt-1">Source: FDA {source}</p>
    </div>
  );
}

interface DateFactProps {
  term: string;
  raw: string;
}

function DateFact({ term, raw }: DateFactProps) {
  return (
    <Fact term={term}>
      <time dateTime={toISODate(raw)}>{formatRecallDate(raw)}</time>
    </Fact>
  );
}

export default function RecallDetail({ recall, onClose, onSelectEvent }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    prevFocusRef.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const focusable = Array.from(
          document.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])'),
        ).filter((el) => !el.hasAttribute("disabled") && el.closest('[role="dialog"]'));
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      prevFocusRef.current?.focus();
    };
  }, [onClose]);

  const risk = riskLevel(recall.classification);
  const category = categorizeReason(recall.reasonForRecall);
  const hazard = hazardLabel(recall.reasonForRecall);
  const firmLocation = [recall.city, recall.state].filter(Boolean).join(", ");
  const hasAddress = Boolean(recall.address1 || recall.postalCode);
  const address = [recall.address1, recall.address2, `${recall.city}, ${recall.state} ${recall.postalCode}`]
    .filter(Boolean)
    .join(", ");
  const isFsis = recall.source === "USDA-FSIS";
  const rawLink = recall.link ?? "";
  const fsisLink = isFsis && (rawLink.startsWith("http://") || rawLink.startsWith("https://")) ? rawLink : "";
  const classificationNote =
    recall.rawClassification && recall.rawClassification !== recall.classification
      ? ` (FDA value: “${recall.rawClassification}”)`
      : "";
  const statusNote =
    recall.rawStatus && recall.rawStatus !== recall.status ? ` (FDA value: “${recall.rawStatus}”)` : "";

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="recall-title">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="animate-slide-in relative flex h-full w-full max-w-xl flex-col bg-paper shadow-2xl motion-reduce:animate-none dark:bg-zinc-900">
        <header className="flex items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <RiskBadge classification={recall.classification} showClass={false} />
              {category && <span className="chip chip-neutral">{category}</span>}
              {hazard && <span className="chip chip-neutral font-semibold">{hazard}</span>}
            </div>
            <h2
              id="recall-title"
              className="font-display text-xl font-semibold leading-snug text-zinc-900 dark:text-zinc-50"
            >
              {recall.productDescription}
            </h2>
          </div>
          <button
            type="button"
            ref={closeRef}
            onClick={onClose}
            className="btn shrink-0"
            aria-label="Close recall details"
          >
            Close
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <Section title="Why it was recalled">
            <p>{recall.reasonForRecall || "Not stated"}</p>
            <p className="hint mt-2">{risk.definition}</p>
          </Section>

          <Section title="Where it was sold">
            <p>{recall.distributionPattern || "Not stated"}</p>
          </Section>

          <Section title="How to identify it">
            {recall.codeInfo ? (
              <CodeBlock text={recall.codeInfo} source="code_info" />
            ) : (
              <p className="text-zinc-500 dark:text-zinc-400">—</p>
            )}
            {recall.moreCodeInfo && (
              <div className="mt-3">
                <p className="mb-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                  More Code Info (continuation)
                </p>
                <CodeBlock text={recall.moreCodeInfo} source="more_code_info" />
              </div>
            )}
            {recall.productQuantity && (
              <dl className="mt-2 divide-y divide-zinc-100 dark:divide-zinc-800">
                <Fact term="Quantity">{recall.productQuantity}</Fact>
              </dl>
            )}
          </Section>

          <Section title="Who recalled it">
            <dl className="divide-y divide-zinc-100 dark:divide-zinc-800">
              <Fact term="Firm">
                {recall.recallingFirm || "Not stated"}
                {firmLocation && ` · ${firmLocation}`}
              </Fact>
              {hasAddress && <Fact term="Firm Address">{address}</Fact>}
              {!isFsis && <Fact term="Voluntary/Mandated">{recall.voluntaryMandated || "Not stated"}</Fact>}
              {recall.initialFirmNotification && <Fact term="Firm Notification">{recall.initialFirmNotification}</Fact>}
            </dl>
          </Section>

          <Section title="Timeline">
            <dl className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {recall.recallInitiationDate ? (
                <DateFact term="Initiation Date" raw={recall.recallInitiationDate} />
              ) : (
                <Fact term="Initiation Date">Not stated</Fact>
              )}
              {recall.centerClassificationDate && (
                <DateFact term="FDA Classification Date" raw={recall.centerClassificationDate} />
              )}
              {recall.terminationDate && <DateFact term="Termination Date" raw={recall.terminationDate} />}
            </dl>
          </Section>

          <Section title="Record">
            <dl className="divide-y divide-zinc-100 dark:divide-zinc-800">
              <Fact term="Source">{recall.source}</Fact>
              <Fact term="Recall #">{recall.recallNumber || "Not stated"}</Fact>
              <Fact term="Event">{recall.eventId || "Not stated"}</Fact>
              {recall.establishmentNumber && <Fact term="Establishment">{recall.establishmentNumber}</Fact>}
              <Fact term="Classification">
                {recall.classification}
                {classificationNote}
              </Fact>
              <Fact term="Status">
                <span className="block">
                  {recall.status || (isFsis ? "Not provided by FSIS" : "Not stated")}
                  {statusNote}
                </span>
                <span className="hint block">{isFsis ? FSIS_AS_PUBLISHED : OPENFDA_AS_PUBLISHED}</span>
              </Fact>
            </dl>
            {fsisLink ? (
              <p className="mt-3">
                <a
                  href={fsisLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-[44px] items-center font-medium text-emerald-800 underline underline-offset-2 dark:text-emerald-300"
                >
                  View on FSIS →
                </a>
              </p>
            ) : (
              <p className="mt-3">
                <a
                  href={`https://www.accessdata.fda.gov/scripts/ires/index.cfm?Product=${encodeURIComponent(
                    recall.productDescription.slice(0, 80),
                  )}#tabNav_advancedSearch`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-[44px] items-center font-medium text-emerald-800 underline underline-offset-2 dark:text-emerald-300"
                >
                  View on FDA Enforcement Reports →
                </a>
              </p>
            )}
            {!isFsis && (
              <p className="hint">
                Developer:{" "}
                <a
                  href={`https://api.fda.gov/food/enforcement.json?search=recall_number:"${encodeURIComponent(recall.recallNumber)}"`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2"
                >
                  raw openFDA JSON
                </a>
              </p>
            )}
          </Section>

          {onSelectEvent && (
            <RelatedEvents
              productDescription={recall.productDescription}
              onSelectEvent={(event) => {
                onClose();
                onSelectEvent(event);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
