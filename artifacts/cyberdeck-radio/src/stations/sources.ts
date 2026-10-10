/**
 * Channel catalog registry. Each source knows how to surface its listing for
 * the active query (or its quickest default when opened with no query), whether
 * its stations can be pinned on the atlas, and the copy the shell renders for
 * its browse/idle states.
 */

import { fetchGardenStations, filterGardenStations } from "./radio-garden";
import { fetchTrendingStations, searchStations } from "./radio-browser";
import { fetchSomaChannels, filterSomaChannels } from "./somafm";
import type Station from "./types";

export type StationSourceId = "airwaves" | "soma" | "garden";

export type StationSource = {
  id: StationSourceId;
  label: string;
  hint: string;
  placeholder: string;
  meta: string;
  /** Whether the catalog provides coordinates that can pin the world atlas. */
  global: boolean;
  /** Directory heading once results are in and the query is empty. */
  browseTitle: string;
  /** Directory heading while idle/loading/empty. */
  placeholderTitle: string;
  /** Idle empty-state headline. */
  idleTitle: string;
  /** Idle empty-state body. */
  idleBody: string;
  getStations(input: {
    query?: string;
    signal?: AbortSignal;
  }): Promise<Station[]>;
};

export const STATION_SOURCES: Record<StationSourceId, StationSource> = {
  airwaves: {
    id: "airwaves",
    label: "AIRWAVES",
    hint: "Search by station name, country, or genre",
    placeholder: "Station name, country, or genre",
    meta: "OPEN API · GEOTAGGED",
    global: true,
    browseTitle: "Live signals worldwide",
    placeholderTitle: "Find your frequency",
    idleTitle: "The dial is yours.",
    idleBody:
      "Enter a station name, country, or genre above to find the real broadcasts reaching out from there.",
    getStations: async ({ query, signal }) =>
      query && query.trim()
        ? searchStations({ query, signal })
        : fetchTrendingStations({ signal }),
  },
  soma: {
    id: "soma",
    label: "SOMA FM",
    hint: "Search the SomaFM channel lineup",
    placeholder: "SomaFM channel or vibe",
    meta: "CURATED CHANNELS · INTERNET ONLY",
    global: false,
    browseTitle: "The SomaFM lineup",
    placeholderTitle: "Browse the lineup",
    idleTitle: "Tuning the lineup.",
    idleBody:
      "SomaFM's channel catalog is on its way. Search a channel, style, or vibe to scan it.",
    getStations: async ({ query, signal }) => {
      const channels = await fetchSomaChannels({ signal });
      return filterSomaChannels(channels, query ?? "");
    },
  },
  garden: {
    id: "garden",
    label: "RADIO GARDEN",
    hint: "Search the scraped world directory",
    placeholder: "Station name or country",
    meta: "CRAWLED CATALOG · GEOTAGGED",
    global: true,
    browseTitle: "Signals from Radio Garden",
    placeholderTitle: "Scan the garden",
    idleTitle: "The garden is listening.",
    idleBody:
      "Radio Garden's world directory is refreshed by a scheduled crawl. Search a station or country to scan it.",
    getStations: async ({ query, signal }) => {
      const stations = await fetchGardenStations({ signal });
      return filterGardenStations(stations, query ?? "");
    },
  },
};

export function listStationSources(): StationSource[] {
  return [STATION_SOURCES.airwaves, STATION_SOURCES.soma, STATION_SOURCES.garden];
}
