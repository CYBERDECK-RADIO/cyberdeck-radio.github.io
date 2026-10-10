import type Station from "./types";

const API_ORIGIN = "https://de1.api.radio-browser.info";
const SEARCH_LIMIT = 30;
const REQUEST_TIMEOUT_MS = 12_000;
const SEARCH_FIELDS = ["name", "tag", "country"] as const;

type SearchStationsInput = {
  query: string;
  signal?: AbortSignal;
};

type ProviderRecord = Record<string, unknown>;

export async function searchStations({
  query,
  signal,
}: SearchStationsInput): Promise<Station[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException("Search was cancelled", "AbortError");
  }

  const requestController = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    requestController.abort();
  }, REQUEST_TIMEOUT_MS);
  const forwardAbort = () => requestController.abort(signal?.reason);
  signal?.addEventListener("abort", forwardAbort, { once: true });

  try {
    const resultGroups = await Promise.all(
      SEARCH_FIELDS.map((field) =>
        fetchCategory(field, cleanQuery, requestController.signal),
      ),
    );

    return normalizeStations(resultGroups.flat()).slice(0, SEARCH_LIMIT);
  } catch (error) {
    if (signal?.aborted) throw error;
    if (timedOut) {
      throw new Error("The station directory took too long to respond. Try again.");
    }
    requestController.abort();
    throw error;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", forwardAbort);
  }
}

async function fetchCategory(
  field: (typeof SEARCH_FIELDS)[number],
  query: string,
  signal: AbortSignal,
): Promise<unknown[]> {
  const url = new URL("/json/stations/search", API_ORIGIN);
  url.searchParams.set(field, query);
  url.searchParams.set("limit", String(SEARCH_LIMIT));
  url.searchParams.set("hidebroken", "true");

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal,
    });
  } catch {
    if (signal.aborted) throw new DOMException("Search was cancelled", "AbortError");
    throw new Error("The station directory could not be reached. Check your connection and try again.");
  }

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error("The station directory is receiving too many requests. Wait a moment and try again.");
    }
    if (response.status >= 500) {
      throw new Error("Station directory is temporarily unavailable. Try again shortly.");
    }
    throw new Error("The station directory rejected this search. Try a different search.");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("The station directory returned unreadable data. Try again shortly.");
  }

  if (!Array.isArray(payload)) {
    throw new Error("The station directory returned an unexpected response. Try again shortly.");
  }

  return payload;
}

function normalizeStations(records: unknown[]): Station[] {
  const stations: Station[] = [];
  const seenIds = new Set<string>();

  for (const value of records) {
    if (!isRecord(value)) continue;

    const id = readString(value.stationuuid);
    const name = readString(value.name);
    const streamUrl =
      readWebUrl(value.url_resolved) ?? readWebUrl(value.url);

    if (!id || !name || !streamUrl || seenIds.has(id)) continue;
    seenIds.add(id);

    const countryCode = readString(value.countrycode)?.toUpperCase();
    const country = readString(value.country);
    const homepage = readWebUrl(value.homepage);
    const codec = readString(value.codec);
    const bitrate = readPositiveNumber(value.bitrate);
    const coordinates = readCoordinates(value.geo_long, value.geo_lat);

    stations.push({
      id,
      name,
      genres: readTags(value.tags),
      streams: [
        {
          url: streamUrl,
          ...(codec ? { codec } : {}),
          ...(bitrate ? { bitrate } : {}),
        },
      ],
      ...(countryCode ? { countryCode } : {}),
      ...(country ? { country } : {}),
      ...(coordinates ? { coordinates } : {}),
      ...(homepage ? { homepage } : {}),
    });
  }

  return stations;
}

function isRecord(value: unknown): value is ProviderRecord {
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
  longitudeValue: unknown,
  latitudeValue: unknown,
): [longitude: number, latitude: number] | undefined {
  const longitude = readFiniteNumber(longitudeValue);
  const latitude = readFiniteNumber(latitudeValue);

  if (
    longitude === undefined ||
    latitude === undefined ||
    longitude < -180 ||
    longitude > 180 ||
    latitude < -90 ||
    latitude > 90
  ) {
    return undefined;
  }

  return [longitude, latitude];
}

function readFiniteNumber(value: unknown): number | undefined {
  if (typeof value !== "number") return undefined;
  return Number.isFinite(value) ? value : undefined;
}

function readTags(value: unknown): string[] {
  const tags = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  return tags
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 8);
}
