/**
 * Shared station display helpers.
 *
 *   Station ──▶ stationLocationLabel ──▶ "Tokyo · Japan · JP"
 *                                    └─▶ "Bayern · Germany · DE"
 *                                    └─▶ "Location not listed"
 *   countryCode ──▶ countryFlag ──▶ "🇯🇵" | null
 *   HealthStatus ──▶ HEALTH_LABELS ──▶ "Live" | "Offline" | …
 */

import type { HealthStatus } from "./stream-health-logic";
import type Station from "./types";

export const HEALTH_LABELS: Record<HealthStatus, string> = {
  live: "Live",
  offline: "Offline",
  checking: "Checking",
  insecure: "No secure stream",
  unknown: "Unknown",
};

const ISO_3166_1_ALPHA_2 = /^[A-Z]{2}$/;

/** Regional-indicator flag emoji for an ISO 3166-1 alpha-2 code, or null. */
export function countryFlag(countryCode?: string): string | null {
  const code = countryCode?.trim().toUpperCase();
  if (!code || !ISO_3166_1_ALPHA_2.test(code)) return null;
  return String.fromCodePoint(
    ...[...code].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65),
  );
}

export function stationLocationLabel(station: Station): string {
  return (
    [
      station.city ?? station.state,
      station.country,
      station.countryCode?.toUpperCase(),
    ]
      .filter(Boolean)
      .join(" · ") || "Location not listed"
  );
}
