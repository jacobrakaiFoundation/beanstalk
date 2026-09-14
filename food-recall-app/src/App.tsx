import { useEffect, useRef, useState } from "react";
import BeanstalkMark, { WordmarkLeaves } from "./components/BeanstalkMark";
import DataStatus from "./components/DataStatus";
import EventCard from "./components/EventCard";
import EventDetail from "./components/EventDetail";
import FilterPanel, { countActiveFilters } from "./components/FilterPanel";
import Pagination from "./components/Pagination";
import PantrySketch from "./components/PantrySketch";
import QuickFilters from "./components/QuickFilters";
import RecallCard from "./components/RecallCard";
import RecallDetail from "./components/RecallDetail";
import SearchBar from "./components/SearchBar";
import SkeletonGrid from "./components/SkeletonGrid";
import WatchlistPanel from "./components/WatchlistPanel";
import { useDarkMode } from "./hooks/useDarkMode";
import { useMediaQuery } from "./hooks/useMediaQuery";
import { useWatchlist } from "./hooks/useWatchlist";
import { type FetchError, fetchRecalls, getLastSynced } from "./lib/api";
import type { DietaryConcern } from "./lib/dietary";
import { eventSearchText, fetchAdverseEvents, getEventLastSynced } from "./lib/events";
import { isNewRecall } from "./lib/formatDate";
import { getPermissionStatus, requestNotificationPermission, sendNotification } from "./lib/notifications";
import type { ReasonCategory } from "./lib/reasonCategory";
import { type DateSortDirection, sortRecallsByDate } from "./lib/sortRecalls";
import { matchesWatchlist } from "./lib/watchlist";
import type { AdverseEvent } from "./types/event";
import { FDA_EVENT_DISCLAIMER } from "./types/event";
import { OPENFDA_AS_PUBLISHED, type Recall, type RecallClassification } from "./types/recall";

type AppTab = "recalls" | "events";

const PAGE_SIZE = 6;
const FDA_MAX_SKIP = 25000;
const MAX_PAGE = Math.floor(FDA_MAX_SKIP / PAGE_SIZE);

function formatRetrieved(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : "unknown";
}

function tabClass(active: boolean, ring: string): string {
  const base = `min-h-[44px] rounded-md px-4 py-2 text-sm transition focus:outline-hidden focus:ring-2 ${ring}`;
  return active
    ? `${base} bg-paper font-semibold text-zinc-900 shadow-xs dark:bg-zinc-800 dark:text-zinc-50`
    : `${base} text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100`;
}

export default function App() {
  const [tab, setTab] = useState<AppTab>("recalls");

  const [recalls, setRecalls] = useState<Recall[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<FetchError | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [classification, setClassification] = useState<RecallClassification | "">("");
  const [status, setStatus] = useState("");
  const [state, setState] = useState("");
  const [dietary, setDietary] = useState<DietaryConcern[]>([]);
  const [selected, setSelected] = useState<Recall | null>(null);
  const [page, setPage] = useState(0);
  const [dateSort, setDateSort] = useState<DateSortDirection>("newest");
  const [hazard, setHazard] = useState<ReasonCategory | "">("");
  const [lastSynced, setLastSynced] = useState<string | null>(getLastSynced());
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return false;
    if (Notification.permission !== "granted") return false;
    try {
      return localStorage.getItem("notificationsEnabled") === "true";
    } catch {
      return true;
    }
  });
  const { items: watchlist, add: addToWatchlist, remove: removeFromWatchlist } = useWatchlist();
  const { dark, toggle: toggleDark } = useDarkMode();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const seenIdsRef = useRef<Set<string>>(new Set());
  const firstLoadRef = useRef(true);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const watchlistRef = useRef(watchlist);
  watchlistRef.current = watchlist;
  const notificationsEnabledRef = useRef(notificationsEnabled);
  notificationsEnabledRef.current = notificationsEnabled;
  const [reloadKey, setReloadKey] = useState(0);
  const triggerReload = () => setReloadKey((k) => k + 1);
  const handleEnableNotifications = async () => {
    const granted = await requestNotificationPermission();
    setNotificationsEnabled(granted);
    try {
      localStorage.setItem("notificationsEnabled", String(granted));
    } catch {
      /* storage unavailable */
    }
  };

  // Adverse events (Early Signals) state
  const [events, setEvents] = useState<AdverseEvent[]>([]);
  const [eventTotal, setEventTotal] = useState(0);
  const [eventError, setEventError] = useState<FetchError | null>(null);
  const [eventIsStale, setEventIsStale] = useState(false);
  const [eventIsDemo, setEventIsDemo] = useState(false);
  const [eventLoading, setEventLoading] = useState(false);
  const [eventPage, setEventPage] = useState(0);
  const [eventLastSynced, setEventLastSynced] = useState<string | null>(getEventLastSynced());
  const [selectedEvent, setSelectedEvent] = useState<AdverseEvent | null>(null);
  const eventRequestIdRef = useRef(0);
  const eventAbortRef = useRef<AbortController | null>(null);
  const eventSeenIdsRef = useRef<Set<string>>(new Set());
  const eventFirstLoadRef = useRef(true);
  const [eventReloadKey, setEventReloadKey] = useState(0);
  const triggerEventReload = () => setEventReloadKey((k) => k + 1);

  const rawTotalPages = Math.ceil(total / PAGE_SIZE);
  const totalPages = Math.max(1, Math.min(rawTotalPages, MAX_PAGE + 1));
  const reachableTotal = Math.min(total, (MAX_PAGE + 1) * PAGE_SIZE);
  const hasTruncatedWindow = total > reachableTotal;

  const eventRawTotalPages = Math.ceil(eventTotal / PAGE_SIZE);
  const eventTotalPages = Math.max(1, Math.min(eventRawTotalPages, MAX_PAGE + 1));
  const eventReachableTotal = Math.min(eventTotal, (MAX_PAGE + 1) * PAGE_SIZE);
  const eventHasTruncatedWindow = eventTotal > eventReachableTotal;

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 400);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    void classification;
    void status;
    void state;
    void dietary;
    void debounced;
    void tab;
    void hazard;
    setPage((prev) => {
      if (prev !== 0) return 0;
      return prev;
    });
    setEventPage((prev) => {
      if (prev !== 0) return 0;
      return prev;
    });
  }, [classification, status, state, dietary, debounced, tab, hazard]);

  useEffect(() => {
    if (page >= totalPages) setPage(totalPages - 1);
  }, [totalPages, page]);

  useEffect(() => {
    if (eventPage >= eventTotalPages) setEventPage(eventTotalPages - 1);
  }, [eventTotalPages, eventPage]);

  // Recalls fetch
  useEffect(() => {
    void reloadKey;
    if (tab !== "recalls") return;
    const requestId = ++requestIdRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    fetchRecalls({
      search: debounced,
      limit: PAGE_SIZE,
      skip: Math.min(page * PAGE_SIZE, FDA_MAX_SKIP),
      classification,
      status,
      state,
      dietary,
      hazard,
      signal: controller.signal,
    })
      .then(({ recalls: data, total: t, error: err, isStale: stale, isDemo: demo }) => {
        if (requestId !== requestIdRef.current) return;
        if (controller.signal.aborted) return;
        setRecalls(data);
        setTotal(t);
        setError(err);
        setIsStale(stale);
        setIsDemo(demo);
        setLastSynced(getLastSynced());
        setLoading(false);
        const newRecalls = data.filter((r) => !seenIdsRef.current.has(r.id));
        if (newRecalls.length > 0 && !firstLoadRef.current && !stale && !demo && !err) {
          const watched = newRecalls.filter(
            (r) =>
              matchesWatchlist(`${r.productDescription} ${r.reasonForRecall} ${r.recallingFirm}`, watchlistRef.current)
                .length > 0,
          );
          if (watched.length > 0 && notificationsEnabledRef.current) {
            sendNotification(
              `${watched.length} newly observed recall${watched.length > 1 ? "s" : ""} matching watchlist`,
              watched.map((r) => r.productDescription.slice(0, 80)).join("\n"),
            );
          }
        }
        data.forEach((r) => {
          seenIdsRef.current.add(r.id);
        });
        if (seenIdsRef.current.size > 1000) {
          const entries = [...seenIdsRef.current];
          seenIdsRef.current = new Set(entries.slice(entries.length - 1000));
        }
        firstLoadRef.current = false;
      })
      .catch(() => {
        if (requestId !== requestIdRef.current) return;
        setLoading(false);
      });
    return () => controller.abort();
  }, [tab, debounced, page, classification, status, state, dietary, hazard, reloadKey]);

  // Adverse events fetch
  useEffect(() => {
    void eventReloadKey;
    if (tab !== "events") return;
    const requestId = ++eventRequestIdRef.current;
    eventAbortRef.current?.abort();
    const controller = new AbortController();
    eventAbortRef.current = controller;
    setEventLoading(true);
    setEventError(null);
    fetchAdverseEvents({
      search: debounced,
      limit: PAGE_SIZE,
      skip: Math.min(eventPage * PAGE_SIZE, FDA_MAX_SKIP),
      signal: controller.signal,
    })
      .then(({ events: data, total: t, error: err, isStale: stale, isDemo: demo }) => {
        if (requestId !== eventRequestIdRef.current) return;
        if (controller.signal.aborted) return;
        setEvents(data);
        setEventTotal(t);
        setEventError(err);
        setEventIsStale(stale);
        setEventIsDemo(demo);
        setEventLastSynced(getEventLastSynced());
        setEventLoading(false);
        const newEvents = data.filter((e) => !eventSeenIdsRef.current.has(e.id));
        if (newEvents.length > 0 && !eventFirstLoadRef.current && !stale && !demo && !err) {
          const watched = newEvents.filter(
            (e) => matchesWatchlist(eventSearchText(e), watchlistRef.current).length > 0,
          );
          if (watched.length > 0 && notificationsEnabledRef.current) {
            sendNotification(
              `${watched.length} newly observed adverse event report${watched.length > 1 ? "s" : ""} matching watchlist`,
              watched.map((e) => (e.products[0]?.nameBrand || e.reportNumber).slice(0, 80)).join("\n"),
            );
          }
        }
        data.forEach((e) => {
          eventSeenIdsRef.current.add(e.id);
        });
        if (eventSeenIdsRef.current.size > 1000) {
          const entries = [...eventSeenIdsRef.current];
          eventSeenIdsRef.current = new Set(entries.slice(entries.length - 1000));
        }
        eventFirstLoadRef.current = false;
      })
      .catch(() => {
        if (requestId !== eventRequestIdRef.current) return;
        setEventLoading(false);
      });
    return () => controller.abort();
  }, [tab, debounced, eventPage, eventReloadKey]);

  const showDemo = tab === "recalls" ? isDemo : eventIsDemo;
  const showStale = tab === "recalls" ? isStale : eventIsStale;
  const showError = tab === "recalls" ? error : eventError;
  const showLastSynced = tab === "recalls" ? lastSynced : eventLastSynced;
  const onRetry = tab === "recalls" ? triggerReload : triggerEventReload;

  const activeFilters = countActiveFilters(classification, status, state, dietary) + (hazard ? 1 : 0);
  const clearAll = () => {
    setClassification("");
    setStatus("");
    setState("");
    setDietary([]);
    setHazard("");
    setQuery("");
  };

  const recallErrorOnly = !loading && error !== null && !isStale && recalls.length === 0;
  const recallEmpty = !loading && error === null && recalls.length === 0;
  const eventErrorOnly = !eventLoading && eventError !== null && !eventIsStale && events.length === 0;
  const eventEmpty = !eventLoading && eventError === null && events.length === 0;

  const recallSidebar = (
    <>
      <FilterPanel
        classification={classification}
        status={status}
        state={state}
        dietary={dietary}
        onClassification={setClassification}
        onStatus={setStatus}
        onState={setState}
        onDietary={setDietary}
        onClear={clearAll}
      />
      <WatchlistPanel items={watchlist} onAdd={addToWatchlist} onRemove={removeFromWatchlist} />
    </>
  );

  const eventSidebar = (
    <>
      <div className="panel space-y-2 p-4 text-xs text-violet-900 dark:text-violet-200">
        <p className="font-semibold">Early Signals filters</p>
        <p>
          Search product brand, reaction, or outcome. Classification, status, state, and dietary filters apply to
          recalls only.
        </p>
        <p role="note">{FDA_EVENT_DISCLAIMER}</p>
        {query && (
          <button type="button" onClick={() => setQuery("")} className="btn btn-quiet px-3 text-xs">
            Clear search
          </button>
        )}
      </div>
      <WatchlistPanel items={watchlist} onAdd={addToWatchlist} onRemove={removeFromWatchlist} />
      <p className="hint px-1">Watchlist terms also match adverse event product brands, reactions, and outcomes.</p>
    </>
  );

  const sidebarPanels = tab === "recalls" ? recallSidebar : eventSidebar;

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-emerald-700 focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>

      <header className="site-header">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 pt-3 sm:px-6">
          <h1 className="flex max-w-full flex-wrap items-center gap-3" aria-label="beanstalk FDA food recall explorer">
            <BeanstalkMark className="h-9 w-9 shrink-0 text-zinc-700 dark:text-zinc-200" />
            <span className="brand-name">
              <span className="sprouting-b">
                b
                <WordmarkLeaves className="wordmark-leaves" />
              </span>
              eanstalk
            </span>
            <span className="pt-2 text-sm font-normal text-zinc-500 dark:text-zinc-400">FDA food recall explorer</span>
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <DataStatus
              sourceLabel={tab === "recalls" ? "FDA data" : "CAERS data"}
              isDemo={showDemo}
              isStale={showStale}
              error={showError}
              lastSynced={showLastSynced}
            />
            {!notificationsEnabled && getPermissionStatus() !== "denied" && (
              <button
                type="button"
                onClick={handleEnableNotifications}
                aria-label="Enable browser alert notifications for watchlist recalls"
                className="btn btn-quiet px-3"
              >
                Enable alerts
              </button>
            )}
            {notificationsEnabled && (
              <span
                className="chip chip-personal min-h-[44px] px-3"
                aria-label="Browser alert notifications are enabled"
                role="status"
              >
                Alerts on
              </span>
            )}
            <button
              type="button"
              onClick={toggleDark}
              aria-pressed={dark}
              aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
              className="btn btn-quiet px-3"
            >
              {dark ? "Light" : "Dark"}
            </button>
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
          <div
            className="inline-flex rounded-lg border border-zinc-200 bg-zinc-100 p-1 dark:border-zinc-800 dark:bg-zinc-950"
            role="tablist"
            aria-label="Data source"
          >
            <button
              type="button"
              role="tab"
              id="tab-recalls"
              aria-selected={tab === "recalls"}
              aria-controls="panel-recalls"
              onClick={() => setTab("recalls")}
              className={tabClass(tab === "recalls", "focus:ring-emerald-600")}
            >
              Recalls
            </button>
            <button
              type="button"
              role="tab"
              id="tab-events"
              aria-selected={tab === "events"}
              aria-controls="panel-events"
              onClick={() => setTab("events")}
              className={tabClass(tab === "events", "focus:ring-violet-600")}
            >
              Early Signals
            </button>
          </div>
        </div>
        {showDemo && (
          <div className="bg-violet-700 px-4 py-2 text-center text-sm font-medium text-white" role="status">
            DEMO MODE — Fictional data, not real FDA {tab === "recalls" ? "recalls" : "adverse event reports"}. Add
            ?demo=1 to URL.
          </div>
        )}
        {showStale && (
          <div className="bg-amber-700 px-4 py-2 text-center text-sm text-white" role="status">
            Stale cached data — live FDA request failed ({showError?.code}).{" "}
            <button type="button" onClick={onRetry} className="font-medium underline underline-offset-2">
              Retry
            </button>
            <span className="opacity-80"> · Cached from {formatRetrieved(showLastSynced)}</span>
          </div>
        )}
        {tab === "events" && (
          <div className="bg-violet-700 px-4 py-2 text-center text-xs text-white sm:text-sm" role="note">
            Early Signals are unverified CAERS community reports — not confirmed recalls. {FDA_EVENT_DISCLAIMER}
          </div>
        )}
      </header>

      <main id="main-content" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        <div className="garden-intro hidden md:flex">
          <div>
            <h2>A little clarity for your pantry.</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {tab === "recalls"
                ? "Search by product, state, or dietary concern."
                : "Search adverse event reports by product, reaction, or outcome."}
            </p>
          </div>
          <PantrySketch />
        </div>
        <div className="grid gap-6 lg:grid-cols-[288px_minmax(0,1fr)]">
          <aside
            aria-label="Search and filters"
            className="space-y-4 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto lg:pr-1"
          >
            <SearchBar value={query} onChange={setQuery} />
            {isDesktop ? (
              sidebarPanels
            ) : (
              <details className="panel">
                <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50 [&::-webkit-details-marker]:hidden">
                  <span>{tab === "recalls" ? "Filters and watchlist" : "Watchlist"}</span>
                  <span className={tab === "recalls" && activeFilters > 0 ? "chip chip-personal" : "chip chip-neutral"}>
                    {tab === "recalls" && activeFilters > 0 ? `${activeFilters} active` : "Show"}
                  </span>
                </summary>
                <div className="space-y-4 border-t border-zinc-100 p-3 dark:border-zinc-800">{sidebarPanels}</div>
              </details>
            )}
          </aside>

          {tab === "recalls" && (
            <section
              id="panel-recalls"
              role="tabpanel"
              aria-labelledby="tab-recalls"
              className="min-w-0"
              aria-busy={loading}
            >
              <div className="mb-4">
                <QuickFilters
                  classification={classification}
                  hazard={hazard}
                  onClassification={setClassification}
                  onHazard={setHazard}
                />
              </div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <p className="text-sm text-zinc-700 dark:text-zinc-300" role="status" aria-live="polite">
                  {loading
                    ? "Loading recalls…"
                    : hasTruncatedWindow
                      ? `${reachableTotal.toLocaleString()} of ${total.toLocaleString()} recalls reachable`
                      : `${total.toLocaleString()} ${total === 1 ? "recall" : "recalls"}`}
                  {!loading && isStale && " · stale"}
                </p>
                {!loading && recalls.length > 0 && (
                  <div className="flex items-center gap-2">
                    <label htmlFor="date-sort" className="label">
                      Sort by date
                    </label>
                    <select
                      id="date-sort"
                      value={dateSort}
                      onChange={(e) => setDateSort(e.target.value === "oldest" ? "oldest" : "newest")}
                      className="input w-auto min-h-[40px] py-1.5 text-sm"
                    >
                      <option value="newest">Newest first</option>
                      <option value="oldest">Oldest first</option>
                    </select>
                  </div>
                )}
              </div>
              <p className="hint mb-4">
                {OPENFDA_AS_PUBLISHED} Enforcement archive, 2004 to present; not a public safety alert feed.
              </p>

              {loading && <SkeletonGrid />}

              {recallErrorOnly && error && (
                <div className="panel px-6 py-12 text-center">
                  <p className="font-medium text-zinc-900 dark:text-zinc-50" role="alert">
                    Failed to load recalls: {error.message} ({error.code})
                  </p>
                  {error.retryable && (
                    <button type="button" onClick={triggerReload} className="btn btn-primary mt-4">
                      Retry
                    </button>
                  )}
                </div>
              )}

              {recallEmpty && (
                <div className="panel px-6 py-12 text-center" role="status">
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">No recalls match your filters.</p>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    Try fewer filters or a broader search term.
                  </p>
                  {(activeFilters > 0 || query) && (
                    <button type="button" onClick={clearAll} className="btn mt-4">
                      Clear filters
                    </button>
                  )}
                </div>
              )}

              {!loading && !recallErrorOnly && (
                <>
                  {recalls.length > 0 && (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      {sortRecallsByDate(recalls, dateSort).map((r) => (
                        <RecallCard
                          key={r.id}
                          recall={r}
                          onSelect={setSelected}
                          isNew={isNewRecall(r.recallInitiationDate)}
                          watchlist={watchlist}
                          dietary={dietary}
                        />
                      ))}
                    </div>
                  )}
                  <Pagination
                    page={page}
                    totalPages={totalPages}
                    onPrevious={() => setPage((p) => Math.max(0, p - 1))}
                    onNext={() => setPage((p) => p + 1)}
                  />
                  {hasTruncatedWindow && (
                    <p className="hint mt-3 text-center">
                      Showing the first {reachableTotal.toLocaleString()} of {total.toLocaleString()}. FDA&apos;s offset
                      limit of {FDA_MAX_SKIP.toLocaleString()} stops paging after page {MAX_PAGE + 1}; narrow the
                      filters to see more.
                    </p>
                  )}
                  <p className="hint mt-2 text-center">
                    Sorted by date, {dateSort === "newest" ? "newest" : "oldest"} first. Dates shown are
                    recall_initiation_date or report_date from FDA.
                  </p>
                </>
              )}
            </section>
          )}

          {tab === "events" && (
            <section
              id="panel-events"
              role="tabpanel"
              aria-labelledby="tab-events"
              className="min-w-0"
              aria-busy={eventLoading}
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <p className="text-sm text-zinc-700 dark:text-zinc-300" role="status" aria-live="polite">
                  {eventLoading
                    ? "Loading adverse event reports…"
                    : eventHasTruncatedWindow
                      ? `${eventReachableTotal.toLocaleString()} of ${eventTotal.toLocaleString()} reports reachable`
                      : `${eventTotal.toLocaleString()} ${eventTotal === 1 ? "report" : "reports"}`}
                  {!eventLoading && eventIsStale && " · stale"}
                </p>
              </div>
              <p className="hint mb-4 text-violet-800 dark:text-violet-300" role="note">
                Community reports / early signals — these are not recalls. {FDA_EVENT_DISCLAIMER}
              </p>

              {eventLoading && <SkeletonGrid />}

              {eventErrorOnly && eventError && (
                <div className="panel px-6 py-12 text-center">
                  <p className="font-medium text-zinc-900 dark:text-zinc-50" role="alert">
                    Failed to load adverse event reports: {eventError.message} ({eventError.code})
                  </p>
                  {eventError.retryable && (
                    <button type="button" onClick={triggerEventReload} className="btn btn-primary mt-4">
                      Retry
                    </button>
                  )}
                </div>
              )}

              {eventEmpty && (
                <div className="panel px-6 py-12 text-center" role="status">
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">
                    No adverse event reports match your search.
                  </p>
                </div>
              )}

              {!eventLoading && !eventErrorOnly && (
                <>
                  {events.length > 0 && (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      {events.map((e) => (
                        <EventCard
                          key={e.id}
                          event={e}
                          onSelect={setSelectedEvent}
                          isNew={isNewRecall(e.dateStarted)}
                          watchlist={watchlist}
                        />
                      ))}
                    </div>
                  )}
                  <Pagination
                    page={eventPage}
                    totalPages={eventTotalPages}
                    onPrevious={() => setEventPage((p) => Math.max(0, p - 1))}
                    onNext={() => setEventPage((p) => p + 1)}
                  />
                  {eventHasTruncatedWindow && (
                    <p className="hint mt-3 text-center">
                      Showing the first {eventReachableTotal.toLocaleString()} of {eventTotal.toLocaleString()}.
                      FDA&apos;s offset limit of {FDA_MAX_SKIP.toLocaleString()} stops paging after page {MAX_PAGE + 1}.
                      Narrow the search to see more.
                    </p>
                  )}
                  <p className="hint mt-2 text-center">
                    Sorted by date_started, newest first. Unverified CAERS reports only.
                  </p>
                </>
              )}
            </section>
          )}
        </div>
      </main>

      {selected && (
        <RecallDetail
          recall={selected}
          onClose={() => setSelected(null)}
          onSelectEvent={(event) => {
            setSelected(null);
            setSelectedEvent(event);
            setTab("events");
          }}
        />
      )}
      {selectedEvent && <EventDetail event={selectedEvent} onClose={() => setSelectedEvent(null)} />}

      <footer className="site-footer border-t border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-7xl space-y-3 px-4 py-6 text-sm text-zinc-600 sm:px-6 dark:text-zinc-400">
          <details>
            <summary className="cursor-pointer font-medium text-zinc-800 dark:text-zinc-200">About this data</summary>
            <div className="mt-2 max-w-prose space-y-2">
              <p>
                Sources:{" "}
                <a
                  className="underline underline-offset-2"
                  href="https://open.fda.gov/apis/food/enforcement/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  openFDA Food Enforcement
                </a>{" "}
                (2004 to present; the dataset typically refreshes mid-week) and{" "}
                <a
                  className="underline underline-offset-2"
                  href="https://open.fda.gov/apis/food/event/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  openFDA Food Adverse Events
                </a>{" "}
                (CAERS). {OPENFDA_AS_PUBLISHED} Status may remain Ongoing after a recall ends; verify with FDA before
                action.
              </p>
              <p>Early Signals are unverified community reports, not recalls. {FDA_EVENT_DISCLAIMER}</p>
              <p>
                Class I means a reasonable probability of serious adverse health consequences (21 CFR 7.3). Classes are
                displayed per FDA record.
              </p>
              <p>
                Search notes: no matches return openFDA 404 (shown as empty). Paging stops at skip 25,000;{" "}
                <code className="text-[11px]">search_after</code> is not used. Related events match any product token
                (parenthesized OR). Watchlist terms also match adverse event product brands, reactions, and outcomes.
              </p>
              <p>
                Meat, poultry, and egg products are regulated by{" "}
                <a
                  className="underline underline-offset-2"
                  href="https://www.fsis.usda.gov/recalls"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  USDA FSIS
                </a>{" "}
                and are not in this dataset.
              </p>
            </div>
          </details>
          <p>Not medical advice.</p>
          <a
            className="inline-flex min-h-11 items-center underline underline-offset-2"
            href={`${import.meta.env.BASE_URL}about.html`}
          >
            About Beanstalk &amp; funding
          </a>
        </div>
      </footer>
    </div>
  );
}
