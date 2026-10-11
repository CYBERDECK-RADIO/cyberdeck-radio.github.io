import { describe, expect, it } from "vitest";

import {
  MAX_RECENT_SEARCHES,
  MAX_SEARCH_LENGTH,
  parseRecentSearches,
  rememberSearch,
} from "./recent-searches";

describe("parseRecentSearches", () => {
  it("keeps valid entries newest first and drops junk", () => {
    expect(parseRecentSearches(["jazz", 42, "", "  ", "tokyo", null])).toEqual([
      "jazz",
      "tokyo",
    ]);
  });

  it("falls back to nothing on malformed input", () => {
    expect(parseRecentSearches(null)).toEqual([]);
    expect(parseRecentSearches("jazz")).toEqual([]);
    expect(parseRecentSearches({ jazz: true })).toEqual([]);
  });

  it("dedupes case-insensitively and never grows past the cap", () => {
    const raw = [
      "Jazz",
      "jazz",
      "JAZZ",
      "ambient",
      "news",
      "world",
      "talk",
      "sports",
      "classical",
    ];
    const parsed = parseRecentSearches(raw);
    expect(parsed).toHaveLength(MAX_RECENT_SEARCHES);
    expect(parsed[0]).toBe("Jazz");
    expect(parsed.filter((entry) => entry.toLowerCase() === "jazz")).toHaveLength(1);
  });

  it("refuses to remember a pasted essay", () => {
    expect(parseRecentSearches(["x".repeat(MAX_SEARCH_LENGTH + 1)])).toEqual([]);
  });
});

describe("rememberSearch", () => {
  it("moves a repeat query to the front without duplicating it", () => {
    expect(rememberSearch(["ambient", "jazz"], "JAZZ")).toEqual(["JAZZ", "ambient"]);
  });

  it("trims the query and ignores blanks", () => {
    expect(rememberSearch(["ambient"], "  ")).toEqual(["ambient"]);
    expect(rememberSearch([], "  news  ")).toEqual(["news"]);
  });

  it("stays capped once the list is full", () => {
    const full = ["a", "b", "c", "d", "e", "f"];
    const next = rememberSearch(full, "g");
    expect(next).toEqual(["g", "a", "b", "c", "d", "e"]);
  });
});
