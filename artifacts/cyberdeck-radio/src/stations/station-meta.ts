/**
 * Shared station display helpers.
 *
 *   Station ──▶ stationLocationLabel ──▶ "Japan · JP" | "Location not listed"
 */

import type Station from "./types";

export function stationLocationLabel(station: Station): string {
  return (
    [station.country, station.countryCode?.toUpperCase()].filter(Boolean).join(" · ") ||
    "Location not listed"
  );
}