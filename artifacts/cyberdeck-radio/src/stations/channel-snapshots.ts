/**
 * Persisted snapshots of channels the visitor kept (pins) or played (history).
 *
 *   station ──▶ store.add ──▶ newest-first list ──▶ localStorage
 *   corrupt blob ──▶ sanitizeStation ──▶ bad entries dropped, never thrown
 *
 * A snapshot carries the whole `Station`, not just its id, so a pinned or
 * recently played channel still renders — and can still be tuned — before any
 * catalog finishes loading, while its source is closed, or after that source
 * has been swapped for another one. Parsing is total: malformed storage falls
 * back to an empty list, and an entry missing the required fields is dropped
 * rather than crashing the app on boot.
 */

import type Station from "./types";

export type SnapshotStoreOptions = {
  /** localStorage key the list is persisted under. */
  storageKey: string;
  /** Newest entries kept; the oldest are evicted past this cap. */
  limit: number;
};

export type SnapshotStore = {
  /** Stable reference until the list actually changes (useSyncExternalStore). */
  getSnapshot(): readonly Station[];
  subscribe(listener: () => void): () => void;
  /** Prepends the channel, refreshing its place. False when nothing changed. */
  add(station: Station): boolean;
  remove(id: string): boolean;
  has(id: string): boolean;
  get(id: string): Station | null;
  clear(): void;
};

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function sanitizeStream(raw: unknown): Station["streams"][number] | null {
  if (raw === null || typeof raw !== "object") return null;
  const candidate = raw as Partial<Record<keyof Station["streams"][number], unknown>>;
  if (typeof candidate.url !== "string" || candidate.url === "") return null;
  const codec = optionalString(candidate.codec);
  const bitrate = optionalNumber(candidate.bitrate);
  return {
    url: candidate.url,
    ...(codec ? { codec } : {}),
    ...(bitrate !== undefined ? { bitrate } : {}),
  };
}

function sanitizeGenres(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((genre): genre is string => typeof genre === "string" && genre !== "");
}

function sanitizeCoordinates(raw: unknown): [number, number] | undefined {
  if (!Array.isArray(raw) || raw.length < 2) return undefined;
  const [longitude, latitude] = raw;
  if (typeof longitude !== "number" || !Number.isFinite(longitude)) return undefined;
  if (typeof latitude !== "number" || !Number.isFinite(latitude)) return undefined;
  return [longitude, latitude];
}

/**
 * Rebuild a `Station` from untrusted JSON, or null when the record cannot
 * identify or play a channel (no id, no stream).
 */
export function sanitizeStation(raw: unknown): Station | null {
  if (raw === null || typeof raw !== "object") return null;
  const candidate = raw as Partial<Record<keyof Station, unknown>> & Record<string, unknown>;
  if (typeof candidate.id !== "string" || candidate.id === "") return null;
  if (!Array.isArray(candidate.streams)) return null;
  const streams = candidate.streams
    .map(sanitizeStream)
    .filter((stream): stream is Station["streams"][number] => stream !== null);
  if (streams.length === 0) return null;

  const station: Station = {
    id: candidate.id,
    name: typeof candidate.name === "string" ? candidate.name : "",
    genres: sanitizeGenres(candidate.genres),
    streams,
  };
  const countryCode = optionalString(candidate.countryCode);
  const country = optionalString(candidate.country);
  const state = optionalString(candidate.state);
  const city = optionalString(candidate.city);
  const homepage = optionalString(candidate.homepage);
  const checkUrl = optionalString(candidate.checkUrl);
  const coordinates = sanitizeCoordinates(candidate.coordinates);
  if (countryCode) station.countryCode = countryCode;
  if (country) station.country = country;
  if (state) station.state = state;
  if (city) station.city = city;
  if (homepage) station.homepage = homepage;
  if (checkUrl) station.checkUrl = checkUrl;
  if (coordinates) station.coordinates = coordinates;
  return station;
}

/**
 * A capped, newest-first, localStorage-backed list of channel snapshots.
 * Every mutation publishes a fresh snapshot reference so React re-renders.
 */
export function createSnapshotStore({ storageKey, limit }: SnapshotStoreOptions): SnapshotStore {
  const listeners = new Set<() => void>();
  let entries: Station[] = [];
  let snapshot: readonly Station[] = entries;

  function publish(): void {
    snapshot = entries.slice();
    for (const listener of listeners) listener();
  }

  function persist(): void {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(entries));
    } catch {
      // Private mode or a full quota: the in-memory list still works this session.
    }
  }

  function readStored(): void {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const restored: Station[] = [];
      const seen = new Set<string>();
      for (const entry of parsed) {
        const station = sanitizeStation(entry);
        if (!station || seen.has(station.id)) continue;
        seen.add(station.id);
        restored.push(station);
        if (restored.length >= limit) break;
      }
      entries = restored;
    } catch {
      // Corrupt blob: start empty rather than crashing the app.
      entries = [];
    }
  }

  if (typeof window !== "undefined") readStored();
  snapshot = entries.slice();

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    add(station) {
      const sanitized = sanitizeStation(station);
      if (!sanitized) return false;
      if (entries[0]?.id === sanitized.id) return false;
      entries = [sanitized, ...entries.filter((item) => item.id !== sanitized.id)].slice(0, limit);
      persist();
      publish();
      return true;
    },
    remove(id) {
      if (!entries.some((item) => item.id === id)) return false;
      entries = entries.filter((item) => item.id !== id);
      persist();
      publish();
      return true;
    },
    has(id) {
      return entries.some((item) => item.id === id);
    },
    get(id) {
      return entries.find((item) => item.id === id) ?? null;
    },
    clear() {
      const hadEntries = entries.length > 0;
      entries = [];
      try {
        window.localStorage.removeItem(storageKey);
      } catch {
        // Nothing to clear when storage is unavailable.
      }
      if (hadEntries) publish();
    },
  };
}
