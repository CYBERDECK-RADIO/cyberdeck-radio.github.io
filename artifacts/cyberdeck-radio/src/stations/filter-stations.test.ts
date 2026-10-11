import { describe, expect, it } from "vitest";

import type Station from "./types";
import {
  EMPTY_FILTERS,
  collectFilterOptions,
  filterStations,
  hasActiveFilters,
  sortStations,
  stationCodecLabel,
  stationMatchesQuery,
} from "./filter-stations";

function station(overrides: Partial<Station> & { id: string }): Station {
  return {
    name: "Station",
    genres: [],
    streams: [{ url: "https://secure.example/live" }],
    ...overrides,
  };
}

const stations: Station[] = [
  station({
    id: "jp-jazz",
    name: "Tokyo Jazz",
    country: "Japan",
    state: "Tokyo",
    city: "Tokyo",
    genres: ["jazz", "lounge"],
    streams: [{ url: "https://secure.example/tokyo", codec: "MP3", bitrate: 128 }],
  }),
  station({
    id: "jp-pop",
    name: "Shibuya Pop",
    country: "Japan",
    state: "Tokyo",
    city: "Shibuya",
    genres: ["pop"],
    streams: [{ url: "https://secure.example/shibuya", codec: "AAC", bitrate: 64 }],
  }),
  station({
    id: "fr-jazz",
    name: "Paris Jazz",
    country: "France",
    state: "Île-de-France",
    city: "Paris",
    genres: ["jazz"],
    streams: [{ url: "https://secure.example/paris", codec: "MP3", bitrate: 320 }],
  }),
  station({ id: "unknown", name: "Mystery Signal", genres: [] }),
];

describe("filterStations", () => {
  it("returns every station when no filter is active", () => {
    expect(filterStations(stations, EMPTY_FILTERS)).toHaveLength(4);
  });

  it("filters by country", () => {
    const result = filterStations(stations, { ...EMPTY_FILTERS, country: "Japan" });

    expect(result.map((item) => item.id)).toEqual(["jp-jazz", "jp-pop"]);
  });

  it("filters by region and city", () => {
    expect(
      filterStations(stations, { ...EMPTY_FILTERS, state: "Tokyo" }).map((item) => item.id),
    ).toEqual(["jp-jazz", "jp-pop"]);
    expect(
      filterStations(stations, { ...EMPTY_FILTERS, city: "Paris" }).map((item) => item.id),
    ).toEqual(["fr-jazz"]);
  });

  it("filters by genre", () => {
    const result = filterStations(stations, { ...EMPTY_FILTERS, genre: "jazz" });

    expect(result.map((item) => item.id)).toEqual(["jp-jazz", "fr-jazz"]);
  });

  it("filters by codec", () => {
    expect(
      filterStations(stations, { ...EMPTY_FILTERS, codec: "AAC" }).map((item) => item.id),
    ).toEqual(["jp-pop"]);
    expect(
      filterStations(stations, { ...EMPTY_FILTERS, codec: "MP3" }).map((item) => item.id),
    ).toEqual(["jp-jazz", "fr-jazz"]);
  });

  it("combines facets", () => {
    const result = filterStations(stations, {
      ...EMPTY_FILTERS,
      country: "Japan",
      state: "Tokyo",
      genre: "jazz",
    });

    expect(result.map((item) => item.id)).toEqual(["jp-jazz"]);
  });

  it("excludes stations with missing metadata only when that facet is active", () => {
    expect(filterStations(stations, EMPTY_FILTERS).map((item) => item.id)).toContain("unknown");
    expect(
      filterStations(stations, { ...EMPTY_FILTERS, country: "Japan" }).map((item) => item.id),
    ).not.toContain("unknown");
    expect(
      filterStations(stations, { ...EMPTY_FILTERS, city: "Tokyo" }).map((item) => item.id),
    ).not.toContain("unknown");
    expect(
      filterStations(stations, { ...EMPTY_FILTERS, codec: "MP3" }).map((item) => item.id),
    ).not.toContain("unknown");
  });

  it("returns every station again after clearing filters", () => {
    const filtered = filterStations(stations, {
      ...EMPTY_FILTERS,
      country: "France",
      genre: "jazz",
    });
    expect(filtered).toHaveLength(1);

    expect(filterStations(stations, EMPTY_FILTERS)).toHaveLength(4);
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterStations(stations, { ...EMPTY_FILTERS, country: "Japan", genre: "polka" })).toEqual(
      [],
    );
  });
});

describe("hasActiveFilters", () => {
  it("is false for the empty filter set and true once a facet is set", () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, city: "Paris" })).toBe(true);
  });
});

describe("stationCodecLabel", () => {
  it("upper-cases the first declared codec", () => {
    expect(stationCodecLabel(stations[0]!)).toBe("MP3");
    expect(stationCodecLabel(station({ id: "x", streams: [{ url: "https://a.example" }] }))).toBeNull();
  });
});

describe("collectFilterOptions", () => {
  it("collects sorted unique options for every facet", () => {
    expect(collectFilterOptions(stations)).toEqual({
      countries: ["France", "Japan"],
      states: ["Île-de-France", "Tokyo"],
      cities: ["Paris", "Shibuya", "Tokyo"],
      genres: ["jazz", "lounge", "pop"],
      codecs: ["AAC", "MP3"],
    });
  });

  it("keeps its own facet list complete while narrowing the others", () => {
    const options = collectFilterOptions(stations, { ...EMPTY_FILTERS, country: "Japan" });

    // The country list still offers every country so the pick can be switched.
    expect(options.countries).toEqual(["France", "Japan"]);
    expect(options.states).toEqual(["Tokyo"]);
    expect(options.cities).toEqual(["Shibuya", "Tokyo"]);
    expect(options.genres).toEqual(["jazz", "lounge", "pop"]);
    expect(options.codecs).toEqual(["AAC", "MP3"]);
  });

  it("omits empty and missing metadata", () => {
    const options = collectFilterOptions([
      station({ id: "a", country: "", genres: ["", "rock"], streams: [{ url: "https://a.example", codec: "  " }] }),
      station({ id: "b", genres: [] }),
    ]);

    expect(options).toEqual({
      countries: [],
      states: [],
      cities: [],
      genres: ["rock"],
      codecs: [],
    });
  });

  it("returns empty options for an empty list", () => {
    expect(collectFilterOptions([])).toEqual({
      countries: [],
      states: [],
      cities: [],
      genres: [],
      codecs: [],
    });
  });
});

describe("sortStations", () => {
  const order = (sort: Parameters<typeof sortStations>[1]) =>
    sortStations(stations, sort).map((item) => item.id);

  it("keeps provider order for relevance", () => {
    expect(order("relevance")).toEqual(["jp-jazz", "jp-pop", "fr-jazz", "unknown"]);
  });

  it("sorts by name", () => {
    expect(order("name")).toEqual(["unknown", "fr-jazz", "jp-pop", "jp-jazz"]);
  });

  it("sorts by country, then name, with locationless stations last", () => {
    expect(order("country")).toEqual(["fr-jazz", "jp-pop", "jp-jazz", "unknown"]);
  });

  it("sorts by bitrate, best first, with unknown bitrates last", () => {
    expect(order("bitrate")).toEqual(["fr-jazz", "jp-jazz", "jp-pop", "unknown"]);
  });

  it("does not mutate the input list", () => {
    const copy = [...stations];
    sortStations(stations, "name");
    expect(stations).toEqual(copy);
  });
});

describe("stationMatchesQuery", () => {
  const tokyo = stations[0]!;

  it("matches on any identity field, case-insensitively", () => {
    expect(stationMatchesQuery(tokyo, "tokyo")).toBe(true);
    expect(stationMatchesQuery(tokyo, "JAZZ")).toBe(true);
    expect(stationMatchesQuery(tokyo, "japan")).toBe(true);
    expect(stationMatchesQuery(tokyo, "lounge")).toBe(true);
  });

  it("requires every token to match (AND semantics)", () => {
    expect(stationMatchesQuery(tokyo, "tokyo jazz")).toBe(true);
    expect(stationMatchesQuery(tokyo, "tokyo polka")).toBe(false);
  });

  it("ignores diacritics", () => {
    const paris = stations[2]!;
    expect(stationMatchesQuery(paris, "ile-de-france")).toBe(true);
    expect(stationMatchesQuery(paris, "São Paulo")).toBe(false);
    expect(stationMatchesQuery({ ...paris, city: "São Paulo" }, "sao paulo")).toBe(true);
  });

  it("treats a blank query as a match", () => {
    expect(stationMatchesQuery(tokyo, "   ")).toBe(true);
  });
});
