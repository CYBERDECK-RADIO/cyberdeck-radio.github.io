import { describe, expect, it } from "vitest";

import { countryFlag, stationLocationLabel } from "./station-meta";
import type Station from "./types";

const station = (overrides: Partial<Station>): Station => ({
  id: "alpha",
  name: "Alpha Wave",
  genres: [],
  streams: [{ url: "https://stream.example/alpha" }],
  ...overrides,
});

describe("countryFlag", () => {
  it("maps an ISO 3166-1 alpha-2 code to a regional-indicator flag", () => {
    expect(countryFlag("FR")).toBe("🇫🇷");
    expect(countryFlag("jp")).toBe("🇯🇵");
    expect(countryFlag(" us ")).toBe("🇺🇸");
  });

  it("returns null when the code is missing or malformed", () => {
    expect(countryFlag(undefined)).toBeNull();
    expect(countryFlag("")).toBeNull();
    expect(countryFlag("F")).toBeNull();
    expect(countryFlag("F1")).toBeNull();
    expect(countryFlag("FRA")).toBeNull();
  });
});

describe("stationLocationLabel", () => {
  it("joins city, country, and code when present", () => {
    expect(
      stationLocationLabel(
        station({ city: "Tokyo", country: "Japan", countryCode: "jp" }),
      ),
    ).toBe("Tokyo · Japan · JP");
  });

  it("falls back to a placeholder without location info", () => {
    expect(stationLocationLabel(station({}))).toBe("Location not listed");
  });
});
