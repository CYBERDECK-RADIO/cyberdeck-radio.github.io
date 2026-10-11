/**
 * Live suggestions for the composite search control.
 *
 *   stations + query ──▶ buildSearchSuggestions ──▶ SearchSuggestion[]
 *
 * One pass over the catalog answers everything the palette shows: matching
 * stations (name-prefix first), matching countries, cities, and genres with
 * their channel counts — and, on an empty query, the browse set (the busiest
 * countries and genres) that gives the palette something to open on.
 *
 * Matching here is a fast case-insensitive substring test over a lower-cased
 * haystack cached per station array; the directory scan behind it stays the
 * diacritic-blind token-AND matcher, so a suggestion is a shortcut into a
 * scan, never a replacement for one.
 */

import type Station from "./types";
import { stationLocationLabel } from "./station-meta";

export type SuggestionKind = "station" | "country" | "city" | "genre";

export type SearchSuggestion = {
  id: string;
  kind: SuggestionKind;
  label: string;
  /** Secondary line: location for stations, channel counts for facets. */
  detail: string;
  /** The term a facet/recent option feeds into the directory scan. */
  query: string;
  /** Present only for station suggestions. */
  stationId?: string;
};

/** How many of each kind the palette paints before saying "scan for more". */
export const SUGGESTION_LIMITS: Record<SuggestionKind, number> = {
  station: 6,
  country: 4,
  city: 4,
  genre: 4,
};

type IndexEntry = {
  station: Station;
  name: string;
  lower: string;
};

/**
 * Lower-cased haystacks, built once per station array (the ~38k-channel garden
 * catalog must not be re-normalized on every keystroke).
 */
const indexCache = new WeakMap<readonly Station[], IndexEntry[]>();

function stationIndex(stations: readonly Station[]): IndexEntry[] {
  const cached = indexCache.get(stations);
  if (cached) return cached;
  const built = stations.map((station) => ({
    station,
    name: station.name.toLowerCase(),
    lower: [
      station.name,
      station.country,
      station.state,
      station.city,
      station.countryCode,
      station.homepage,
      ...station.genres,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
  }));
  indexCache.set(stations, built);
  return built;
}

function tokenize(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function countLabel(count: number): string {
  return `${count.toLocaleString("en-US")} channels`;
}

function facetSuggestion(
  kind: Exclude<SuggestionKind, "station">,
  label: string,
  count: number,
  extra?: string,
): SearchSuggestion {
  return {
    id: `${kind}:${label.toLowerCase()}`,
    kind,
    label,
    detail: extra ? `${extra} · ${countLabel(count)}` : countLabel(count),
    query: label,
  };
}

function topFacets(
  tally: Map<string, number>,
  kind: "country" | "genre",
  limit: number,
): SearchSuggestion[] {
  return [...tally.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([label, count]) => facetSuggestion(kind, label, count));
}

export function buildSearchSuggestions(
  stations: readonly Station[],
  query: string,
): SearchSuggestion[] {
  const index = stationIndex(stations);
  if (index.length === 0) return [];

  const countries = new Map<string, number>();
  const cities = new Map<string, { count: number; country: string }>();
  const genres = new Map<string, number>();
  const tokens = tokenize(query);

  type Ranked = { entry: IndexEntry; score: number; order: number };
  const needle = tokens.join(" ");
  const ranked: Ranked[] = [];

  for (let order = 0; order < index.length; order += 1) {
    const entry = index[order];
    const { station } = entry;
    if (station.country) {
      countries.set(station.country, (countries.get(station.country) ?? 0) + 1);
    }
    if (station.city) {
      const known = cities.get(station.city);
      if (known) known.count += 1;
      else cities.set(station.city, { count: 1, country: station.country ?? "" });
    }
    for (const genre of station.genres) {
      if (genre) genres.set(genre, (genres.get(genre) ?? 0) + 1);
    }
    if (tokens.length === 0) continue;
    if (!tokens.every((token) => entry.lower.includes(token))) continue;
    const score = entry.name.startsWith(needle) ? 0 : entry.name.includes(needle) ? 1 : 2;
    ranked.push({ entry, score, order });
  }

  // An empty query opens the palette on the busiest places and styles.
  if (tokens.length === 0) {
    return [
      ...topFacets(countries, "country", SUGGESTION_LIMITS.country),
      ...topFacets(genres, "genre", SUGGESTION_LIMITS.genre),
    ];
  }

  const matchesTokens = (label: string) => {
    const lower = label.toLowerCase();
    return tokens.every((token) => lower.includes(token));
  };

  const stationSuggestions = ranked
    .sort((a, b) => a.score - b.score || a.order - b.order)
    .slice(0, SUGGESTION_LIMITS.station)
    .map(({ entry }) => ({
      id: `station:${entry.station.id}`,
      kind: "station" as const,
      label: entry.station.name || "Untitled station",
      detail: stationLocationLabel(entry.station),
      query: "",
      stationId: entry.station.id,
    }));

  const countrySuggestions = [...countries.entries()]
    .filter(([label]) => matchesTokens(label))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, SUGGESTION_LIMITS.country)
    .map(([label, count]) => facetSuggestion("country", label, count));

  const citySuggestions = [...cities.entries()]
    .filter(([label]) => matchesTokens(label))
    .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
    .slice(0, SUGGESTION_LIMITS.city)
    .map(([label, info]) => facetSuggestion("city", label, info.count, info.country || undefined));

  const genreSuggestions = [...genres.entries()]
    .filter(([label]) => matchesTokens(label))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, SUGGESTION_LIMITS.genre)
    .map(([label, count]) => facetSuggestion("genre", label, count));

  return [
    ...stationSuggestions,
    ...countrySuggestions,
    ...citySuggestions,
    ...genreSuggestions,
  ];
}
