/**
 * Radio Garden source: a pre-scraped, same-origin station catalog.
 *
 * Radio Garden's own API is CORS-locked to its origin and gated by Cloudflare,
 * so the browser cannot call it. A scheduled CI job crawls the directory and
 * bakes the result into `public/radio-garden.json` (see
 * `scripts/src/scrape-radio-garden.ts`):
 *
 *   public/radio-garden.json(,gz) ──▶ fetchGardenStations ──▶ Station[]
 *   stations + query          ──▶ filterGardenStations ──▶ Station[] (client-side)
 *
 * Each station carries a resolved direct stream URL when the crawler could
 * follow Radio Garden's `channel.mp3` redirect, plus the `channel.mp3` listen
 * URL as an HTTPS fallback. Records are geotagged, so they pin the atlas.
 *
 * The raw catalog is ~10 MB, so the deploy workflow also publishes
 * `public/radio-garden.json.gz`. The adapter fetches the gzipped copy and
 * decompresses it in-browser (`DecompressionStream`), transparently falling
 * back to the plain JSON file when the gzip copy is missing, unreadable, or
 * `DecompressionStream` is unavailable.
 *
 * If the catalog has not been generated yet (e.g. local dev), the missing file
 * is treated as an empty catalog rather than an error.
 */

import type Station from "./types";
import { stationMatchesQuery } from "./filter-stations";

const DATA_URL = `${import.meta.env.BASE_URL}radio-garden.json`;
const GZIP_DATA_URL = `${DATA_URL}.gz`;
const REQUEST_TIMEOUT_MS = 12_000;
const CACHE_TTL_MS = 10 * 60_000;

type FetchOptions = { signal?: AbortSignal };

export type GardenCatalogInfo = {
  /** Channels the last crawl wrote into the catalog. */
  count: number;
  /** ISO timestamp of that crawl, when the payload carries one. */
  generatedAt: string | null;
};

export async function fetchGardenStations({
  signal,
}: FetchOptions = {}): Promise<Station[]> {
  return getCachedStations(signal);
}

/**
 * Nothing is capped here: the atlas clusters the catalog down to a few hundred
 * markers and the directory pages through its rows, so every channel Radio
 * Garden knows about stays reachable — browse and search alike.
 */
export function filterGardenStations(
  stations: Station[],
  query: string,
): Station[] {
  const cleanQuery = query.trim().toLowerCase();
  if (!cleanQuery) return stations;

  return stations.filter((station) => stationMatchesQuery(station, cleanQuery));
}

let catalogInfo: GardenCatalogInfo | null = null;

/** Freshness of the loaded crawl — rendered as the footer's catalog chip. */
export function getGardenCatalogInfo(): GardenCatalogInfo | null {
  return catalogInfo;
}

let cache: { at: number; stations: Station[] } | null = null;

export function resetGardenStationsCache(): void {
  cache = null;
  catalogInfo = null;
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
    let payload: unknown;
    try {
      payload = await fetchCatalogPayload(GZIP_DATA_URL, requestController.signal);
      if (payload === null) {
        payload = await fetchCatalogPayload(DATA_URL, requestController.signal);
      }
    } catch (error) {
      if (!(error instanceof CatalogFallbackError)) throw error;
      payload = await fetchCatalogPayload(DATA_URL, requestController.signal);
    }

    if (payload === null) return [];

    const records = isObject(payload) ? payload.stations : undefined;
    if (!Array.isArray(records)) {
      throw new Error(
        "The Radio Garden catalog is malformed. Try again shortly.",
      );
    }

    const generatedAt = isObject(payload) ? payload.generatedAt : undefined;
    catalogInfo = {
      count:
        isObject(payload) && typeof payload.count === "number"
          ? payload.count
          : records.length,
      generatedAt: typeof generatedAt === "string" ? generatedAt : null,
    };

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

/**
 * Marks a gzip-copy fetch that should retry against the plain JSON catalog
 * (missing file, network failure, or an undecodable gzip stream). Carries the
 * same reachability copy we surface for the plain-JSON path.
 */
class CatalogFallbackError extends Error {
  constructor() {
    super(
      "The Radio Garden catalog could not be reached. Check your connection and try again.",
    );
    this.name = "CatalogFallbackError";
  }
}

async function fetchCatalogPayload(
  url: string,
  signal: AbortSignal,
): Promise<unknown | null> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json, application/gzip" },
      signal,
    });
  } catch {
    if (signal.aborted) {
      throw new DOMException("Search was cancelled", "AbortError");
    }
    throw new CatalogFallbackError();
  }

  if (response.status === 404) return null;

  if (!response.ok) {
    throw new Error(
      "The Radio Garden catalog is temporarily unavailable. Try again shortly.",
    );
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch {
    throw new Error(
      "The Radio Garden catalog is unreadable. Try again shortly.",
    );
  }

  return parseCatalogBytes(bytes);
}

function isGzip(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

async function parseCatalogBytes(bytes: Uint8Array): Promise<unknown> {
  if (isGzip(bytes)) {
    if (typeof DecompressionStream === "undefined") {
      throw new CatalogFallbackError();
    }
    let text: string;
    try {
      const payload = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
      const decompressed = new Blob([payload])
        .stream()
        .pipeThrough(new DecompressionStream("gzip"));
      text = await new Response(decompressed).text();
    } catch {
      throw new CatalogFallbackError();
    }
    return parseJson(text);
  }

  return parseJson(new TextDecoder().decode(bytes));
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      "The Radio Garden catalog is unreadable. Try again shortly.",
    );
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
  const state = readString(record.state);
  const city = readString(record.city);
  const coordinates = readCoordinates(record.coordinates);

  return {
    id,
    name,
    genres: readTags(record.genres),
    streams,
    ...(country ? { country } : {}),
    ...(countryCode ? { countryCode } : {}),
    ...(state ? { state } : {}),
    ...(city ? { city } : {}),
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
