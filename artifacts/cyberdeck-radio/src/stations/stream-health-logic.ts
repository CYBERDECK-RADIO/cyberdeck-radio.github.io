/**
 * Stream health classification shared by the background worker and its tests.
 *
 * A probe hits a station's `checkUrl` with a byte range request. radio-browser
 * answers with JSON `{ ok: true, url }` after validating the stream server-side
 * (its `url` is the currently resolved stream); direct icecast hosts (SomaFM)
 * answer with audio status codes. Classification:
 *
 *   reachable over https ──▶ live
 *   reachable but http-only ──▶ insecure (unplayable on an https page)
 *   definitive failure ──▶ offline
 *   abort / unable to verify ──▶ unknown
 */

export type HealthStatus = "unknown" | "checking" | "live" | "offline" | "insecure";

/** Normal sweep cadence for a channel that is live or awaiting a first verdict. */
export const RECHECK_INTERVAL_MS = 5 * 60_000;
/**
 * Consecutive offline probes required before a channel is reported offline:
 * one failure is often a transient blip, so the worker holds the previous
 * verdict and quickly re-probes before the client quarantines the record.
 */
export const OFFLINE_CONFIRMATIONS = 2;
/** Quick second probe after the first offline strike, well before the 5-min sweep. */
export const OFFLINE_CONFIRM_DELAY_MS = 45_000;
/**
 * Slow re-probe window for channels confirmed offline: the client quarantines
 * them into its local cache, so the worker only has to notice the stream
 * coming back — a 10–20 minute spread (randomized per channel so the whole
 * quarantine never wakes up in the same sweep) keeps dead records cheap.
 */
export const OFFLINE_RECHECK_MIN_MS = 10 * 60_000;
export const OFFLINE_RECHECK_MAX_MS = 20 * 60_000;

export function recheckDelayMs(
  status: HealthStatus,
  offlineStreak = 0,
  random: () => number = Math.random,
): number {
  if (status !== "offline") return RECHECK_INTERVAL_MS;
  if (offlineStreak < OFFLINE_CONFIRMATIONS) return OFFLINE_CONFIRM_DELAY_MS;
  return OFFLINE_RECHECK_MIN_MS + random() * (OFFLINE_RECHECK_MAX_MS - OFFLINE_RECHECK_MIN_MS);
}

export function isServerSideHealthCheck(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith("radio-browser.info");
  } catch {
    return false;
  }
}

export function isSecureResolvedUrl(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

export async function classifyHealthResponse(
  response: Response,
  checkUrl: string,
): Promise<"live" | "offline" | "insecure"> {
  if (!response.ok) return "offline";
  if (isServerSideHealthCheck(checkUrl)) {
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return "offline";
    }
    if (typeof payload !== "object" || payload === null) return "offline";
    const body = payload as { ok?: unknown; url?: unknown };
    if (body.ok !== true) return "offline";
    const resolvedUrl = typeof body.url === "string" ? body.url : undefined;
    if (resolvedUrl !== undefined && !isSecureResolvedUrl(resolvedUrl)) {
      return "insecure";
    }
    return "live";
  }
  return "live";
}

export function classifyHealthError(
  error: unknown,
  online = navigator.onLine,
): "offline" | "unknown" {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "unknown";
  }
  return online ? "offline" : "unknown";
}