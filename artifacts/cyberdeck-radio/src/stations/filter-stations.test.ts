import { describe, expect, it } from "vitest";

import type Station from "./types";
import {
  EMPTY_FILTERS,
  collectFilterOptions,
  filterStations,
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
  station({ id: "jp-jazz", name: "Tokyo Jazz", country: "Japan", genres: ["jazz", "lounge"] }),
  station({ id: "jp-pop", name: "Shibuya Pop", country: "Japan", genres: ["pop"] }),
  station({ id: "fr-jazz", name: "Paris Jazz", country: "France", genres: ["jazz"] }),
  station({ id: "unknown", name: "Mystery Signal", genres: [] }),
];

describe("filterStations", () => {
  it("returns every station when no filter is active", () => {
    expect(filterStations(stations, EMPTY_FILTERS)).toHaveLength(4);
  });

  it("filters by country", () => {
    const result = filterStations(stations, { country: "Japan", genre: null });

    expect(result.map((item) => item.id)).toEqual(["jp-jazz", "jp-pop"]);
  });

  it("filters by genre", () => {
    const result = filterStations(stations, { country: null, genre: "jazz" });

    expect(result.map((item) => item.id)).toEqual(["jp-jazz", "fr-jazz"]);
  });

  it("combines country and genre", () => {
    const result = filterStations(stations, { country: "Japan", genre: "jazz" });

    expect(result.map((item) => item.id)).toEqual(["jp-jazz"]);
  });

  it("excludes stations with missing metadata only when that filter is active", () => {
    expect(filterStations(stations, EMPTY_FILTERS).map((item) => item.id)).toContain("unknown");
    expect(filterStations(stations, { country: "Japan", genre: null }).map((item) => item.id)).not.toContain("unknown");
    expect(filterStations(stations, { country: null, genre: "jazz" }).map((item) => item.id)).not.toContain("unknown");
  });

  it("returns every station again after clearing filters", () => {
    const filtered = filterStations(stations, { country: "France", genre: "jazz" });
    expect(filtered).toHaveLength(1);

    expect(filterStations(stations, EMPTY_FILTERS)).toHaveLength(4);
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterStations(stations, { country: "Japan", genre: "polka" })).toEqual([]);
  });
});

describe("collectFilterOptions", () => {
  it("collects sorted unique countries and genres", () => {
    expect(collectFilterOptions(stations)).toEqual({
      countries: ["France", "Japan"],
      genres: ["jazz", "lounge", "pop"],
    });
  });

  it("omits empty and missing metadata", () => {
    const options = collectFilterOptions([
      station({ id: "a", country: "", genres: ["", "rock"] }),
      station({ id: "b", genres: [] }),
    ]);

    expect(options).toEqual({ countries: [], genres: ["rock"] });
  });

  it("returns empty options for an empty list", () => {
    expect(collectFilterOptions([])).toEqual({ countries: [], genres: [] });
  });
});