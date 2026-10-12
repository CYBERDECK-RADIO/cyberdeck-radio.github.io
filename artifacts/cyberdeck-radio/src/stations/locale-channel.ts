/**
 * The "closest local channel" fallback for a first visit.
 *
 *   navigator.language(s)  ──▶ getLocaleCountryCode ──▶ "US"
 *   catalog + country code ──▶ findClosestLocaleStation ──▶ Station | null
 *
 * When no channel this browser played before is still in the directory, the
 * deck falls back to a hometown signal: the channel nearest the centre of the
 * visitor's locale country. Both helpers are total — an unknown region, an
 * empty country, or missing coordinates yields null rather than throwing.
 */

import { findNearestStation } from "../map/nearest-station";
import type Station from "./types";

type Coordinates = [number, number];

/** The visitor's country from the browser locale tags, upper-cased, or null. */
export function getLocaleCountryCode(): string | null {
  if (typeof navigator === "undefined") return null;
  const tags = [navigator.language, ...(navigator.languages ?? [])];
  for (const tag of tags) {
    const region = regionOf(tag);
    if (region) return region;
  }
  return null;
}

function regionOf(tag: string | undefined): string | null {
  if (!tag) return null;
  try {
    const region = new Intl.Locale(tag).region;
    if (region) return region.toUpperCase();
  } catch {
    // Fall through to the plain tag split below.
  }
  const match = /[-_]([A-Za-z]{2})$/.exec(tag);
  return match ? match[1].toUpperCase() : null;
}

/**
 * The station nearest the centre of the given country's channels. Null when
 * the catalog holds no channel in that country, or no country is known.
 */
export function findClosestLocaleStation(
  stations: readonly Station[],
  countryCode: string | null,
): Station | null {
  if (!countryCode) return null;
  const wanted = countryCode.toUpperCase();
  const local = stations.filter(
    (station) => station.countryCode?.toUpperCase() === wanted,
  );
  if (local.length === 0) return null;

  const center = centroidOfCoordinates(local);
  if (center) {
    const nearest = findNearestStation([...local], center);
    if (nearest) return nearest;
  }
  return local[0] ?? null;
}

function centroidOfCoordinates(stations: readonly Station[]): Coordinates | null {
  let longitude = 0;
  let latitude = 0;
  let count = 0;
  for (const station of stations) {
    const coordinates = station.coordinates;
    if (!coordinates) continue;
    if (!Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1])) continue;
    longitude += coordinates[0];
    latitude += coordinates[1];
    count += 1;
  }
  if (count === 0) return null;
  return [longitude / count, latitude / count];
}
