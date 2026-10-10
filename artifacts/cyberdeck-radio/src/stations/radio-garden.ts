/**
 * Radio Garden source: a pre-scraped, same-origin station catalog.
 *
 * Radio Garden's own API is CORS-locked to its origin and gated by Cloudflare,
 * so the browser cannot call it. A scheduled CI job crawls the directory and
 * bakes the result into `public/radio-garden.json` (see
 * `scripts/src/scrape-radio-garden.ts`):
 *
 *   public/radio-garden.json ──▶ fetchGardenStations ──▶ Station[]
 *   stations + query          ──▶ filterGardenStations ──▶ Station[] (client-side)
 *
 * Each station carries a resolved direct stream URL when the crawler could
 * follow Radio Garden's `channel.mp3` redirect, plus the `channel.mp3` listen
 * URL as an HTTPS fallback. Records are geotagged, so they pin the atlas.
 *
 * If the catalog has not been generated yet (e.g. local dev), the missing file
 * is treated as an empty catalog rather than an error.
 */

import type Station from "./types";

const DATA_URL = `${import.meta.env.BASE_URL}radio-garden.json`;
const BROWSE_LIMIT = 200;
const SEARCH_LIMIT = 250;
const REQUEST_TIMEOUT_MS = 12_000;
const CACHE_TTL_MS = 10 * 60_000;

type FetchOptions = { signal?: AbortSignal };

export async function fetchGardenStations({
  signal,
}: FetchOptions = {}): Promise<Station[]> {
  return getCachedStations(signal);
}

export function filterGardenStations(
  stations: Station[],
  query: string,
): Station[] {
  const cleanQuery = query.trim().toLowerCase();
  if (!cleanQuery) return stations.slice(0, BROWSE_LIMIT);

  return stations
    .filter((station) => {
      const haystack = [station.name, station.country, ...station.genres]
        .join(" ")
        .toLowerCase();
      return haystack.includes(cleanQuery);
    })
    .slice(0, SEARCH_LIMIT);
}

let cache: { at: number; stations: Station[] } | null = null;

export function resetGardenStationsCache(): void {
  cache = null;
}

async function getCachedStations(signal?: AbortSignal): Promise<Station[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.stations;

  const stations = await requestStations(signal);
  cache = { at: Date.now(), stations };
  return stations;
}

async function requestStations(signal?: AbortSignal): Promise<Station[]> {
  const requestController = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    requestController.abort();
  }, REQUEST_TIMEOUT_MS);
  const forwardAbort = () => requestController.abort(signal?.reason);
  signal?.addEventListener("abort", forwardAbort, { once: true });

  try {
    let response: Response;
    try {
      response = await fetch(DATA_URL, {
        headers: { Accept: "application/json" },
        signal: requestController.signal,
      });
    } catch {
      if (requestController.signal.aborted) {
        throw new DOMException("Search was cancelled", "AbortError");
      }
      throw new Error(
        "The Radio Garden catalog could not be reached. Check your connection and try again.",
      );
    }

    if (response.status === 404) return [];

    if (!response.ok) {
      throw new Error(
        "The Radio Garden catalog is temporarily unavailable. Try again shortly.",
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error(
        "The Radio Garden catalog is unreadable. Try again shortly.",
      );
    }

    const records = isObject(payload) ? payload.stations : undefined;
    if (!Array.isArray(records)) {
      throw new Error(
        "The Radio Garden catalog is malformed. Try again shortly.",
      );
    }

    return records
      .map(toStation)
      .filter((station): station is Station => station !== null);
  } catch (error) {
    if (signal?.aborted) throw error;
    if (timedOut) {
      throw new Error("The Radio Garden catalog took too long to respond. Try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", forwardAbort);
  }
}

function toStation(record: unknown): Station | null {
  if (!isObject(record)) return null;

  const id = readString(record.id);
  const name = readString(record.name);
  if (!id || !name) return null;

  const streams = readStreams(record.streams);
  if (streams.length === 0) return null;

  const country = readString(record.country);
  const countryCode = readString(record.countryCode)?.toUpperCase();
  const coordinates = readCoordinates(record.coordinates);

  return {
    id,
    name,
    genres: readTags(record.genres),
    streams,
    ...(country ? { country } : {}),
    ...(countryCode ? { countryCode } : {}),
    ...(coordinates ? { coordinates } : {}),
  };
}

function readStreams(value: unknown): Station["streams"] {
  if (!Array.isArray(value)) return [];

  const streams: Station["streams"] = [];
  const seen = new Set<string>();

  for (const entry of value) {
    const url = readWebUrl(isObject(entry) ? entry.url : entry);
    if (!url || seen.has(url)) continue;
    seen.add(url);

    const codec = isObject(entry) ? readString(entry.codec) : undefined;
    const bitrate = isObject(entry) ? readPositiveNumber(entry.bitrate) : undefined;

    streams.push({
      url,
      ...(codec ? { codec } : {}),
      ...(bitrate ? { bitrate } : {}),
    });
  }

  return streams;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const result = value.trim();
  return result.length > 0 ? result : undefined;
}

function readWebUrl(value: unknown): string | undefined {
  const candidate = readString(value);
  if (!candidate) return undefined;

  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function readPositiveNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function readCoordinates(
  value: unknown,
): [longitude: number, latitude: number] | undefined {
  if (!Array.isArray(value) || value.length < 2) return undefined;
  const [longitude, latitude] = value;

  if (
    typeof longitude !== "number" ||
    typeof latitude !== "number" ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    longitude < -180 ||
    longitude > 180 ||
    latitude < -90 ||
    latitude > 90
  ) {
    return undefined;
  }

  return [longitude, latitude];
}

function readTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 8);
}
