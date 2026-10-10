/**
 * Radio Garden catalog scraper.
 *
 * Radio Garden's JSON API is CORS-locked to its own origin and protected by
 * Cloudflare, so the static CyberDeck Radio app cannot call it from the
 * browser. This script runs in CI (Node, no CORS), sends a browser User-Agent
 * to pass the bot check, and bakes a station catalog into the app's `public/`
 * directory for same-origin consumption:
 *
 *   /ara/content/places                     ──▶ every place with coordinates
 *   /ara/content/page/{placeId}/channels    ──▶ the channels registered there
 *   /ara/content/listen/{id}/channel.mp3    ──▶ 302 → the live stream URL
 *   ──▶ public/radio-garden.json            ──▶ the app's "RADIO GARDEN" source
 *
 * The listen endpoint is always kept as a playable fallback (`https`), so a
 * station still tunes even if its direct stream URL cannot be resolved.
 *
 * Tunables (env):
 *   RG_CONCURRENCY        parallel requests (default 8)
 *   RG_PLACES_LIMIT       scrape only the first N places (default 0 = all)
 *   RG_RESOLVE_STREAMS    1/0: follow the listen redirect to a direct URL
 *   RG_REQUEST_TIMEOUT_MS per-request timeout (default 20000)
 *   RG_RETRIES            attempts per request (default 3)
 *   RG_OUT                output path (default public/radio-garden.json)
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API_ORIGIN = "https://radio.garden";
const API_BASE = `${API_ORIGIN}/api`;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = path.resolve(
  SCRIPT_DIR,
  "../../artifacts/cyberdeck-radio/public/radio-garden.json",
);

const CONCURRENCY = readInt("RG_CONCURRENCY", 8, 1);
const PLACES_LIMIT = readInt("RG_PLACES_LIMIT", 0, 0);
const RESOLVE_STREAMS = readFlag("RG_RESOLVE_STREAMS", true);
const REQUEST_TIMEOUT_MS = readInt("RG_REQUEST_TIMEOUT_MS", 20_000, 1_000);
const RETRIES = readInt("RG_RETRIES", 3, 1);
const OUT_PATH = process.env.RG_OUT?.trim() || DEFAULT_OUT;

type Place = {
  id: string;
  title: string;
  country?: string;
  geo?: [number, number];
};

type OutputStream = { url: string; codec?: string; bitrate?: number };

type OutputStation = {
  id: string;
  name: string;
  country?: string;
  countryCode?: string;
  coordinates?: [number, number];
  genres: string[];
  streams: OutputStream[];
};

type OutputFile = {
  generatedAt: string;
  source: "radio.garden";
  count: number;
  stations: OutputStation[];
};

type ChannelRef = {
  url?: string;
  title?: string;
  country?: { title?: string };
};

function readInt(name: string, fallback: number, min: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= min ? parsed : fallback;
}

function readFlag(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  return raw === "1" || raw.toLowerCase() === "true";
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  console.log(`[radio-garden] scraping ${API_BASE} → ${OUT_PATH}`);

  const places = await listPlaces();
  const targets = PLACES_LIMIT > 0 ? places.slice(0, PLACES_LIMIT) : places;
  console.log(
    `[radio-garden] ${places.length} places found; scanning ${targets.length}`,
  );

  const seen = new Set<string>();
  const stations: OutputStation[] = [];
  let scanned = 0;

  await mapWithConcurrency(targets, CONCURRENCY, async (place) => {
    const refs = await channelsForPlace(place);
    for (const ref of refs) {
      const id = channelIdOf(ref.url);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      stations.push(toStation(id, ref, place));
    }
    scanned += 1;
    if (scanned % 200 === 0) {
      console.log(
        `[radio-garden] ${scanned}/${targets.length} places · ${stations.length} stations`,
      );
    }
  });

  if (RESOLVE_STREAMS) {
    console.log(`[radio-garden] resolving ${stations.length} streams`);
    let done = 0;
    await mapWithConcurrency(stations, CONCURRENCY, async (station) => {
      const channelId = station.id.replace(/^garden:/, "");
      const resolved = await resolveStream(channelId);
      if (resolved) {
        const listen = station.streams[station.streams.length - 1];
        station.streams = [
          { url: resolved },
          ...(listen && listen.url !== resolved ? [listen] : []),
        ];
      }
      done += 1;
      if (done % 500 === 0) {
        console.log(`[radio-garden] resolved ${done}/${stations.length}`);
      }
    });
  }

  stations.sort((a, b) => a.name.localeCompare(b.name));

  const payload: OutputFile = {
    generatedAt: new Date().toISOString(),
    source: "radio.garden",
    count: stations.length,
    stations,
  };

  await mkdir(path.dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(payload), "utf8");

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `[radio-garden] wrote ${stations.length} stations in ${seconds}s (${OUT_PATH})`,
  );
}

async function listPlaces(): Promise<Place[]> {
  const payload = await requestJson(`${API_BASE}/ara/content/places`);
  const list = asRecord(payload)?.data;
  const records = asRecord(list)?.list;
  if (!Array.isArray(records)) {
    throw new Error("radio.garden returned an unexpected places payload");
  }

  const places: Place[] = [];
  for (const value of records) {
    const record = asRecord(value);
    if (!record) continue;
    const id = asString(record.id);
    const title = asString(record.title);
    if (!id || !title) continue;
    places.push({
      id,
      title,
      country: asString(record.country),
      geo: asCoordinates(record.geo),
    });
  }
  return places;
}

async function channelsForPlace(place: Place): Promise<ChannelRef[]> {
  let payload: unknown;
  try {
    payload = await requestJson(
      `${API_BASE}/ara/content/page/${encodeURIComponent(place.id)}/channels`,
    );
  } catch (error) {
    console.warn(`[radio-garden] place ${place.id} failed: ${describe(error)}`);
    return [];
  }

  const content = asRecord(asRecord(payload)?.data)?.content;
  if (!Array.isArray(content)) return [];

  const refs: ChannelRef[] = [];
  for (const section of content) {
    const items = asRecord(section)?.items;
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      const page = asRecord(asRecord(item)?.page) ?? asRecord(item);
      if (!page) continue;
      const url = asString(page.url);
      if (!url || !url.startsWith("/listen/")) continue;
      const country = asRecord(page.country);
      refs.push({
        url,
        title: asString(page.title),
        country: country ? { title: asString(country.title) } : undefined,
      });
    }
  }
  return refs;
}

function toStation(id: string, ref: ChannelRef, place: Place): OutputStation {
  const name = ref.title ?? place.title;
  const country = ref.country?.title ?? place.country;
  const listenUrl = `${API_ORIGIN}/api/ara/content/listen/${encodeURIComponent(id)}/channel.mp3`;

  return {
    id: `garden:${id}`,
    name,
    genres: [],
    streams: [{ url: listenUrl }],
    ...(country ? { country } : {}),
    ...(country ? countryCodeFor(country) : {}),
    ...(place.geo ? { coordinates: place.geo } : {}),
  };
}

async function resolveStream(channelId: string): Promise<string | null> {
  const url = `${API_BASE}/ara/content/listen/${encodeURIComponent(channelId)}/channel.mp3`;
  const target = await followRedirect(url);
  if (!target) return null;
  return target.startsWith("https://") ? target : null;
}

async function followRedirect(url: string): Promise<string | null> {
  for (let attempt = 0; attempt < RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "HEAD",
        redirect: "manual",
        headers: { "User-Agent": USER_AGENT, Accept: "*/*" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const location = response.headers.get("location");
      if (location) return new URL(location, API_ORIGIN).toString();
      return null;
    } catch {
      await delay(200 * (attempt + 1));
    }
  }
  return null;
}

async function requestJson(url: string): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 0; attempt < RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt + 1 < RETRIES) await delay(500 * (attempt + 1));
    }
  }
  throw new Error(`request to ${url} failed: ${describe(lastError)}`);
}

async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index]);
    }
  });
  await Promise.all(runners);
}

function channelIdOf(url: string | undefined): string | null {
  if (!url) return null;
  const parts = url.split("/").filter(Boolean);
  const last = parts[parts.length - 1];
  return last && last.length > 0 ? last : null;
}

const COUNTRY_ALIASES: Record<string, string> = {
  "czech republic": "CZ",
  turkey: "TR",
  "south korea": "KR",
  "north korea": "KP",
  "united states of america": "US",
  "vatican city": "VA",
  "ivory coast": "CI",
  myanmar: "MM",
  laos: "LA",
  syria: "SY",
  vietnam: "VN",
  russia: "RU",
  iran: "IR",
  bolivia: "BO",
  venezuela: "VE",
  tanzania: "TZ",
  moldova: "MD",
  macedonia: "MK",
  "north macedonia": "MK",
  brunei: "BN",
  "cape verde": "CV",
  swaziland: "SZ",
  "east timor": "TL",
  "united kingdom": "GB",
  england: "GB",
  scotland: "GB",
  wales: "GB",
  "the gambia": "GM",
  "congo-kinshasa": "CD",
  "congo-brazzaville": "CG",
  "republic of the congo": "CG",
  "democratic republic of the congo": "CD",
  "hong kong": "HK",
  macau: "MO",
  macao: "MO",
  taiwan: "TW",
  "puerto rico": "PR",
  kosovo: "XK",
};

let countryCodes: Map<string, string> | null = null;

function countryCodeFor(country: string): Record<string, string> {
  const normalized = country.trim().toLowerCase();
  const alias = COUNTRY_ALIASES[normalized];
  if (alias) return { countryCode: alias };
  const code = buildCountryMap().get(normalized);
  return code ? { countryCode: code } : {};
}

function buildCountryMap(): Map<string, string> {
  if (countryCodes) return countryCodes;
  const map = new Map<string, string>();
  let display: Intl.DisplayNames | null = null;
  try {
    display = new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    display = null;
  }
  if (display) {
    for (let first = 65; first <= 90; first += 1) {
      for (let second = 65; second <= 90; second += 1) {
        const code = String.fromCharCode(first, second);
        let name: string | undefined;
        try {
          name = display.of(code);
        } catch {
          name = undefined;
        }
        if (name && name !== code) map.set(name.toLowerCase(), code);
      }
    }
  }
  countryCodes = map;
  return map;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asCoordinates(value: unknown): [number, number] | undefined {
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

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(`[radio-garden] fatal: ${describe(error)}`);
  process.exitCode = 1;
});
