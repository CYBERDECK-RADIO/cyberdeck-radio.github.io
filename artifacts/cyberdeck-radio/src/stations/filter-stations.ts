/**
 * Client-side filtering of an already-fetched station set.
 *
 *   stations + filters ──▶ filterStations ──▶ matching Station[]
 *   stations ──▶ collectFilterOptions ──▶ { countries, genres }
 *
 * A null filter matches everything. A station with missing country/genre is
 * excluded only while that specific filter is active, so incomplete metadata
 * never hides a station from an unfiltered list.
 */

import type Station from "./types";

export type StationFilters = {
  country: string | null;
  genre: string | null;
};

export const EMPTY_FILTERS: StationFilters = { country: null, genre: null };

export function filterStations(
  stations: Station[],
  filters: StationFilters,
): Station[] {
  return stations.filter((station) => {
    if (filters.country && station.country !== filters.country) return false;
    if (filters.genre && !station.genres.includes(filters.genre)) return false;
    return true;
  });
}

export function collectFilterOptions(stations: Station[]): {
  countries: string[];
  genres: string[];
} {
  const countries = new Set<string>();
  const genres = new Set<string>();

  for (const station of stations) {
    if (station.country) countries.add(station.country);
    for (const genre of station.genres) {
      if (genre) genres.add(genre);
    }
  }

  return {
    countries: [...countries].sort((a, b) => a.localeCompare(b)),
    genres: [...genres].sort((a, b) => a.localeCompare(b)),
  };
}