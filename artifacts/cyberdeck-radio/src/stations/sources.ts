/**
 * Unified channel directory. The crawl-backed Radio Garden catalog, the live
 * radio-browser.info directory, and the SomaFM lineup surface as one merged
 * station list — every radio channel belongs to a single group, with the
 * catalogs only acknowledged in the footer credit.
 */

import { fetchGardenStations, filterGardenStations } from "./radio-garden";
import { fetchTrendingStations, searchStations } from "./radio-browser";
import { fetchSomaChannels, filterSomaChannels } from "./somafm";
import type Station from "./types";

export type StationSourceMeta = {
  /** Attribute in the app footer for the catalog this source supplies. */
  credit: { label: string; href: string };
};

export const CATALOG_CREDITS: StationSourceMeta["credit"][] = [
  { label: "RADIO.GARDEN", href: "https://radio.garden/" },
  { label: "RADIO-BROWSER.INFO", href: "https://www.radio-browser.info/" },
  { label: "SOMAFM.COM", href: "https://somafm.com/" },
];

export type GetStationsInput = {
  query?: string;
  signal?: AbortSignal;
};

/**
 * Surface every catalog as a single group. A query is answered by all three
 * catalogs at once (live search for radio-browser, client-side matching for the
 * baked catalogs); the empty-query default merges each catalog's quickest
 * listing.
 */
export async function getStations({
  query,
  signal,
}: GetStationsInput = {}): Promise<Station[]> {
  if (query?.trim()) return getQueriedStations(query, signal);
  return getDefaultStations(signal);
}

async function getQueriedStations(
  query: string,
  signal?: AbortSignal,
): Promise<Station[]> {
  const [garden, soma, live] = await Promise.all([
    filterGardenStations(await fetchGardenStations({ signal }), query),
    filterSomaChannels(await fetchSomaChannels({ signal }), query),
    searchStations({ query, signal }),
  ]);
  return mergeStations([garden, soma, live]);
}

async function getDefaultStations(signal?: AbortSignal): Promise<Station[]> {
  const [garden, soma, trending] = await Promise.all([
    fetchGardenStations({ signal }),
    fetchSomaChannels({ signal }),
    fetchTrendingStations({ signal }),
  ]);
  return mergeStations([garden, soma, trending]);
}

/**
 * One station per channel: collapse repeats by id, and by identical listen URL
 * for records that cross catalogs under different ids (the baked Radio Garden
 * crawl and the live radio-browser.info directory often know the same channel).
 * Garden lands first so its geotagged records win the de-dupe.
 */
function mergeStations(groups: Station[][]): Station[] {
  const merged: Station[] = [];
  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();

  for (const station of groups.flat()) {
    if (seenIds.has(station.id)) continue;
    const url = station.streams[0]?.url;
    if (url && seenUrls.has(url)) continue;
    seenIds.add(station.id);
    if (url) seenUrls.add(url);
    merged.push(station);
  }

  return merged;
}