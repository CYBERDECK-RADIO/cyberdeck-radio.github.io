/**
 * Faceted filtering, sorting, and free-text matching over a station set.
 *
 *   stations + filters ──▶ filterStations ──▶ matching Station[]
 *   stations + filters ──▶ collectFilterOptions ──▶ per-facet option lists
 *   stations + sort    ──▶ sortStations ──▶ ordered Station[]
 *   station + query    ──▶ stationMatchesQuery ──▶ boolean (token AND match)
 *
 * A null facet matches everything. A station with missing metadata is excluded
 * only while that specific facet is active, so incomplete records never hide
 * from an unfiltered list. Facet option lists are faceted too: the country list
 * keeps every country while a genre is selected, because each list is derived
 * from the stations matching all the *other* active facets.
 */

import type Station from "./types";

export type StationFilters = {
  country: string | null;
  state: string | null;
  city: string | null;
  genre: string | null;
  codec: string | null;
};

export type StationSort = "relevance" | "name" | "country" | "bitrate";

export const STATION_SORTS: StationSort[] = [
  "relevance",
  "name",
  "country",
  "bitrate",
];

export const SORT_LABELS: Record<StationSort, string> = {
  relevance: "Featured",
  name: "Name A–Z",
  country: "Country",
  bitrate: "Bitrate",
};

export const EMPTY_FILTERS: StationFilters = {
  country: null,
  state: null,
  city: null,
  genre: null,
  codec: null,
};

export type StationFilterOptions = {
  countries: string[];
  states: string[];
  cities: string[];
  genres: string[];
  codecs: string[];
};

export function hasActiveFilters(filters: StationFilters): boolean {
  return (
    filters.country !== null ||
    filters.state !== null ||
    filters.city !== null ||
    filters.genre !== null ||
    filters.codec !== null
  );
}

/** Upper-cased codec of a station's best stream ("MP3"), if it declares one. */
export function stationCodecLabel(station: Station): string | null {
  for (const stream of station.streams) {
    const codec = stream.codec?.trim();
    if (codec) return codec.toUpperCase();
  }
  return null;
}

function matchesStation(station: Station, filters: StationFilters): boolean {
  if (filters.country && station.country !== filters.country) return false;
  if (filters.state && station.state !== filters.state) return false;
  if (filters.city && station.city !== filters.city) return false;
  if (filters.genre && !station.genres.includes(filters.genre)) return false;
  if (filters.codec && stationCodecLabel(station) !== filters.codec) return false;
  return true;
}

export function filterStations(
  stations: Station[],
  filters: StationFilters,
): Station[] {
  return stations.filter((station) => matchesStation(station, filters));
}

/**
 * Option lists for every facet, each derived from the stations that match all
 * the other active facets — so picking a country narrows the city list without
 * collapsing the country list itself.
 */
export function collectFilterOptions(
  stations: Station[],
  filters: StationFilters = EMPTY_FILTERS,
): StationFilterOptions {
  const withoutFacet = (facet: keyof StationFilters): Station[] =>
    stations.filter((station) =>
      matchesStation(station, { ...filters, [facet]: null }),
    );

  const countries = new Set<string>();
  const states = new Set<string>();
  const cities = new Set<string>();
  const genres = new Set<string>();
  const codecs = new Set<string>();

  for (const station of withoutFacet("country")) {
    if (station.country) countries.add(station.country);
  }
  for (const station of withoutFacet("state")) {
    if (station.state) states.add(station.state);
  }
  for (const station of withoutFacet("city")) {
    if (station.city) cities.add(station.city);
  }
  for (const station of withoutFacet("genre")) {
    for (const genre of station.genres) {
      if (genre) genres.add(genre);
    }
  }
  for (const station of withoutFacet("codec")) {
    const codec = stationCodecLabel(station);
    if (codec) codecs.add(codec);
  }

  const sorted = (values: Set<string>) =>
    [...values].sort((a, b) => a.localeCompare(b));

  return {
    countries: sorted(countries),
    states: sorted(states),
    cities: sorted(cities),
    genres: sorted(genres),
    codecs: sorted(codecs),
  };
}

export function sortStations(
  stations: Station[],
  sort: StationSort,
): Station[] {
  if (sort === "relevance") return stations;

  const collator = new Intl.Collator(undefined, { sensitivity: "base" });
  const byName = (a: Station, b: Station) => collator.compare(a.name, b.name);
  const bitrateOf = (station: Station) =>
    station.streams.reduce((best, stream) => Math.max(best, stream.bitrate ?? 0), 0);

  const sorted = [...stations];
  switch (sort) {
    case "name":
      sorted.sort(byName);
      break;
    case "country":
      sorted.sort((a, b) => {
        const locationOf = (item: Station) => item.country ?? item.countryCode ?? "";
        const rank = (item: Station) => (locationOf(item) ? 0 : 1);
        const byRank = rank(a) - rank(b);
        if (byRank !== 0) return byRank;
        const byCountry = collator.compare(locationOf(a), locationOf(b));
        return byCountry !== 0 ? byCountry : byName(a, b);
      });
      break;
    case "bitrate":
      sorted.sort((a, b) => bitrateOf(b) - bitrateOf(a) || byName(a, b));
      break;
  }
  return sorted;
}

/**
 * Normalized token-AND match across a station's identity fields. Every token
 * must hit somewhere in the haystack, so "jazz tokyo" finds a Tokyo jazz
 * station while diacritics and case stay forgiving ("são" matches "Sao").
 */
export function stationMatchesQuery(station: Station, query: string): boolean {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return true;

  const haystack = normalizeText(
    [
      station.name,
      station.country,
      station.state,
      station.city,
      station.countryCode,
      station.homepage,
      ...station.genres,
    ]
      .filter(Boolean)
      .join(" "),
  );

  return tokens.every((token) => haystack.includes(token));
}

function tokenizeQuery(query: string): string[] {
  return normalizeText(query)
    .split(/\s+/)
    .filter(Boolean);
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}
