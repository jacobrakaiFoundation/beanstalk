/**
 * FDA's enforcement-report app opens `?Event=` as the iRES recall event.
 * openFDA `event_id` is that id. A product row needs an iRES product id,
 * which an openFDA record does not contain.
 */
const EVENT_URL = "https://www.accessdata.fda.gov/scripts/ires/index.cfm?Event=";

export function fdaEnforcementReportURL(eventId: string): string | null {
  const trimmed = eventId.trim();
  if (!/^[1-9]\d{0,11}$/.test(trimmed)) return null;
  return `${EVENT_URL}${trimmed}`;
}
