import { describe, expect, it } from "vitest";

import {
  SUGGESTION_LIMITS,
  buildSearchSuggestions,
  type SearchSuggestion,
} from "./search-suggestions";
import type Station from "./types";

function station(id: string, name: string, extra: Partial<Station> = {}): Station {
  return {
    id,
    name,
    genres: [],
    streams: [{ url: `https://stream.example/${id}` }],
    ...extra,
  };
}

const catalog: Station[] = [
  station("paris-jazz", "Paris Jazz FM", {
    country: "France",
    countryCode: "FR",
    city: "Paris",
    genres: ["jazz"],
  }),
  station("jazz-night", "Night Jazz", {
    country: "France",
    city: "Lyon",
    genres: ["jazz", "ambient"],
  }),
  station("tokyo-wave", "Tokyo Wave", {
    country: "Japan",
    city: "Tokyo",
    genres: ["world"],
  }),
  station("ambient-one", "Ambient One", {
    country: "Germany",
    city: "Berlin",
    genres: ["ambient"],
  }),
  station("news-fr", "Radio News", {
    country: "France",
    city: "Paris",
    genres: ["news"],
  }),
];

const ids = (suggestions: SearchSuggestion[]) => suggestions.map((item) => item.id);

describe("buildSearchSuggestions", () => {
  it("opens an empty query on the busiest countries and genres", () => {
    const suggestions = buildSearchSuggestions(catalog, "   ");
    expect(ids(suggestions)).toEqual([
      "country:france",
      "country:germany",
      "country:japan",
      "genre:ambient",
      "genre:jazz",
      "genre:news",
      "genre:world",
    ]);
    expect(suggestions[0].detail).toBe("3 channels");
  });

  it("puts matching stations ahead of the facets they live in", () => {
    const suggestions = buildSearchSuggestions(catalog, "jazz");
    expect(ids(suggestions)).toEqual([
      "station:paris-jazz",
      "station:jazz-night",
      "genre:jazz",
    ]);
    const [first] = suggestions;
    expect(first.kind).toBe("station");
    expect(first.detail).toBe("Paris · France · FR");
    expect(first.stationId).toBe("paris-jazz");
  });

  it("ranks name-prefix matches before mere mentions", () => {
    const suggestions = buildSearchSuggestions(catalog, "paris");
    expect(ids(suggestions)).toEqual([
      "station:paris-jazz",
      "station:news-fr",
      "city:paris",
    ]);
    const city = suggestions.find((item) => item.kind === "city");
    expect(city?.detail).toBe("France · 2 channels");
    expect(city?.query).toBe("Paris");
  });

  it("needs every token before it suggests anything", () => {
    expect(buildSearchSuggestions(catalog, "jazz tokyo")).toEqual([]);
    expect(ids(buildSearchSuggestions(catalog, "tokyo"))).toEqual([
      "station:tokyo-wave",
      "city:tokyo",
    ]);
  });

  it("caps each kind so the palette never floods", () => {
    const busy = Array.from({ length: 12 }, (_, index) =>
      station(`jazz-${index}`, `Jazz ${index}`, {
        country: "France",
        city: "Paris",
        genres: ["jazz"],
      }),
    );
    const suggestions = buildSearchSuggestions(busy, "jazz");
    expect(
      suggestions.filter((item) => item.kind === "station"),
    ).toHaveLength(SUGGESTION_LIMITS.station);
    expect(suggestions.filter((item) => item.kind === "genre")).toHaveLength(1);

    const everywhere = Array.from({ length: 8 }, (_, index) =>
      station(`land-${index}`, `Station ${index}`, {
        country: `Land ${index}`,
        genres: ["world"],
      }),
    );
    const browse = buildSearchSuggestions(everywhere, "");
    expect(
      browse.filter((item) => item.kind === "country"),
    ).toHaveLength(SUGGESTION_LIMITS.country);
    expect(browse.filter((item) => item.kind === "genre")).toHaveLength(1);
  });

  it("has nothing to suggest for an empty catalog", () => {
    expect(buildSearchSuggestions([], "jazz")).toEqual([]);
    expect(buildSearchSuggestions([], "")).toEqual([]);
  });
});
