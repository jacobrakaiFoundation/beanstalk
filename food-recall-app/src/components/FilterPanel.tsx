import type { DietaryConcern } from "../lib/dietary";
import { OPENFDA_AS_PUBLISHED, type RecallClassification, type RecallSource } from "../types/recall";
import DietaryFilter from "./DietaryFilter";
import StateFilter from "./StateFilter";

interface Props {
  classification: string;
  status: string;
  state: string;
  dietary: DietaryConcern[];
  source?: RecallSource | "";
  onClassification: (v: RecallClassification | "") => void;
  onStatus: (v: string) => void;
  onState: (v: string) => void;
  onDietary: (v: DietaryConcern[]) => void;
  onSource?: (v: RecallSource | "") => void;
  onClear: () => void;
}

export function countActiveFilters(
  classification: string,
  status: string,
  state: string,
  dietary: DietaryConcern[],
  source: RecallSource | "" = "",
): number {
  return [classification, status, state, source].filter(Boolean).length + dietary.length;
}

export default function FilterPanel({
  classification,
  status,
  state,
  dietary,
  source = "",
  onClassification,
  onStatus,
  onState,
  onDietary,
  onSource = () => {},
  onClear,
}: Props) {
  const active = countActiveFilters(classification, status, state, dietary, source);
  return (
    <div className="panel divide-y divide-zinc-100 dark:divide-zinc-800">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Filters
          {active > 0 && <span className="chip chip-personal ml-2">{active} active</span>}
        </h2>
        <button type="button" onClick={onClear} className="btn btn-quiet px-3 text-xs" aria-label="Clear all filters">
          Clear
        </button>
      </div>

      <div className="space-y-4 px-4 py-4">
        <div>
          <label htmlFor="classification-select" className="label mb-1">
            Classification
          </label>
          <select
            id="classification-select"
            value={classification}
            onChange={(e) => onClassification(e.target.value as RecallClassification | "")}
            className="input"
          >
            <option value="">All classes</option>
            <option value="Class I">Class I</option>
            <option value="Class II">Class II</option>
            <option value="Class III">Class III</option>
          </select>
        </div>
        <div>
          <label htmlFor="status-select" className="label mb-1">
            Status
          </label>
          <select id="status-select" value={status} onChange={(e) => onStatus(e.target.value)} className="input">
            <option value="">All statuses</option>
            <option value="Ongoing">Ongoing</option>
            <option value="Completed">Completed</option>
            <option value="Terminated">Terminated</option>
          </select>
          <p className="hint mt-1">{OPENFDA_AS_PUBLISHED}</p>
        </div>
        <div>
          <label htmlFor="source-select" className="label mb-1">
            Source
          </label>
          <select
            id="source-select"
            value={source}
            onChange={(e) => onSource(e.target.value as RecallSource | "")}
            className="input"
          >
            <option value="">All sources</option>
            <option value="FDA">FDA</option>
            <option value="USDA-FSIS">USDA-FSIS</option>
          </select>
        </div>
        <StateFilter selected={state} onChange={onState} />
      </div>

      <div className="px-4 py-4">
        <DietaryFilter selected={dietary} onChange={onDietary} />
      </div>
    </div>
  );
}
