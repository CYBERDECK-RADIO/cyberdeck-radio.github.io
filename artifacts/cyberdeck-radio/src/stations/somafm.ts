/**
 * SomaFM source: a keyless, CORS-open channel directory served as static JSON.
 *
 *   channels.json ──▶ fetchSomaChannels ──▶ Station[]
 *   channels + query ──▶ filterSomaChannels ──▶ Station[] (client-side)
 *
 * Streams follow SomaFM's published layout: each channel is served from its
 * icecast nodes as `https://ice2.somafm.com/{id}-128-mp3`, which answer with
 * `Access-Control-Allow-Origin: *`, so the health worker can probe them
 * directly. Stations carry no coordinates, so they never pin the atlas.
 */

import type Station from "./types";
import { stationMatchesQuery } from "./filter-stations";

const CHANNELS_ORIGIN = "https://somafm.com";
const CHANNELS_URL = `${CHANNELS_ORIGIN}/channels.json`;
const STREAM_ORIGIN = "https://ice2.somafm.com";
const REQUEST_TIMEOUT_MS = 12_000;
const CACHE_TTL_MS = 10 * 60_000;

type SomaRecord = {
  id?: unknown;
  title?: unknown;
  description?: unknown;
  genre?: unknown;
  dj?: unknown;
  listeners?: unknown;
};

type FetchOptions = { signal?: AbortSignal };

export async function fetchSomaChannels({
  signal,
}: FetchOptions = {}): Promise<Station[]> {
  const records = await getCachedChannels(signal);
  return records.map(toStation).filter((station): station is Station => station !== null);
}

export function filterSomaChannels(
  channels: Station[],
  query: string,
): Station[] {
  if (!query.trim()) return channels;
  return channels.filter((station) => stationMatchesQuery(station, query));
}

function toStation(record: SomaRecord): Station | null {
  const id = readString(record.id);
  const name = readString(record.title);
  if (!id || !name) return null;

  const genres = readTags(record.genre);

  return {
    id: `soma:${id}`,
    name,
    genres,
    streams: [
      {
        url: `${STREAM_ORIGIN}/${id}-128-mp3`,
        codec: "MP3",
        bitrate: 128,
      },
    ],
    homepage: `https://somafm.com/${id}/`,
    checkUrl: `https://somafm.com/${id}.pls`,
  };
}

let cache: { at: number; records: SomaRecord[] } | null = null;

export function resetSomaChannelsCache(): void {
  cache = null;
}

async function getCachedChannels(
  signal?: AbortSignal,
): Promise<SomaRecord[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.records;

  const records = await requestChannels(signal);
  cache = { at: Date.now(), records };
  return records;
}

async function requestChannels(signal?: AbortSignal): Promise<SomaRecord[]> {
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
      response = await fetch(CHANNELS_URL, {
        headers: { Accept: "application/json" },
        signal: requestController.signal,
      });
    } catch {
      if (requestController.signal.aborted) throw new DOMException("Search was cancelled", "AbortError");
      throw new Error("SomaFM channels could not be reached. Check your connection and try again.");
    }

    if (!response.ok) {
      throw new Error("SomaFM channels are temporarily unavailable. Try again shortly.");
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error("SomaFM returned unreadable channel data. Try again shortly.");
    }

    const channels = isObject(payload) ? payload.channels : undefined;
    if (!Array.isArray(channels)) {
      throw new Error("SomaFM returned an unexpected response. Try again shortly.");
    }

    return channels.filter(isRecord);
  } catch (error) {
    if (signal?.aborted) throw error;
    if (timedOut) {
      throw new Error("SomaFM channels took too long to respond. Try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", forwardAbort);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRecord(value: unknown): value is SomaRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const result = value.trim();
  return result.length > 0 ? result : undefined;
}

function readTags(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value
    .split("|")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 6);
}