/**
 * Stream health classification shared by the background worker and its tests.
 *
 * A probe hits a station's `checkUrl` with a byte range request. radio-browser
 * answers with JSON `{ ok: true }` after validating the stream server-side;
 * direct icecast hosts (SomaFM) answer with audio status codes. Classification:
 *
 *   reachable + ok ──▶ live
 *   definitive failure ──▶ offline
 *   abort / unable to verify ──▶ unknown
 */

export type HealthStatus = "unknown" | "checking" | "live" | "offline";

export function isServerSideHealthCheck(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith("radio-browser.info");
  } catch {
    return false;
  }
}

export async function classifyHealthResponse(
  response: Response,
  checkUrl: string,
): Promise<"live" | "offline"> {
  if (!response.ok) return "offline";
  if (isServerSideHealthCheck(checkUrl)) {
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return "offline";
    }
    if (typeof payload !== "object" || payload === null) return "offline";
    return (payload as { ok?: unknown }).ok === true ? "live" : "offline";
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