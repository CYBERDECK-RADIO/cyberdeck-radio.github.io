/**
 * Deep links to a tuned channel.
 *
 *   station id ──▶ buildStationLink ──▶ /?station=garden:abc (shareable)
 *   location.search ──▶ parseStationIdFromSearch ──▶ station id (restore)
 *
 * One query parameter carries the whole intent: a shared link re-opens the
 * atlas with that channel locked (never autoplayed — browsers would only
 * reject it), and every deliberate tune rewrites the address in place so the
 * current URL is always copyable. Everything here is pure string work; only
 * the shell touches the actual URL.
 */

export const STATION_PARAM = "station";

/** "?station=…", "station=…", or "" — tolerant of whatever it is handed. */
export function parseStationIdFromSearch(search: string): string | null {
  const normalized = search.startsWith("?") ? search.slice(1) : search;
  if (!normalized) return null;
  for (const pair of normalized.split("&")) {
    const [rawKey, ...rest] = pair.split("=");
    if (rawKey !== STATION_PARAM) continue;
    const value = rest.join("=");
    let decoded = value;
    try {
      decoded = decodeURIComponent(value.replace(/\+/g, " "));
    } catch {
      return null; // Malformed escape: no id is better than a wrong one.
    }
    return decoded !== "" ? decoded : null;
  }
  return null;
}

/** The query string with the station param set (or removed when null). */
export function withStationParam(search: string, stationId: string | null): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (stationId) params.set(STATION_PARAM, stationId);
  else params.delete(STATION_PARAM);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** Absolute link to a channel: `${base}?station=…` (base defaults to "/"). */
export function buildStationLink(stationId: string, base = "/"): string {
  const id = `${STATION_PARAM}=${encodeURIComponent(stationId)}`;
  if (base.endsWith("?")) return `${base}${id}`;
  if (base.includes("?")) return `${base}&${id}`;
  return `${base}?${id}`;
}
