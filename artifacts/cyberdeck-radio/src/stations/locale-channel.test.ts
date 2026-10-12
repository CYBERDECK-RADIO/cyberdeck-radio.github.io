// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import type Station from "./types";
import { findClosestLocaleStation, getLocaleCountryCode } from "./locale-channel";

function station(
  id: string,
  countryCode?: string,
  coordinates?: Station["coordinates"],
): Station {
  return {
    id,
    name: id,
    countryCode,
    coordinates,
    genres: [],
    streams: [{ url: `https://stream.example/${id}` }],
  };
}

const originalLanguage = Object.getOwnPropertyDescriptor(window.navigator, "language");

afterEach(() => {
  if (originalLanguage) {
    Object.defineProperty(window.navigator, "language", originalLanguage);
  } else {
    Reflect.deleteProperty(window.navigator, "language");
  }
});

describe("getLocaleCountryCode", () => {
  it("reads the region subtag from the browser locale", () => {
    Object.defineProperty(window.navigator, "language", {
      configurable: true,
      value: "pt-BR",
    });
    expect(getLocaleCountryCode()).toBe("BR");
  });

  it("returns null for a language tag with no region", () => {
    Object.defineProperty(window.navigator, "language", {
      configurable: true,
      value: "en",
    });
    Object.defineProperty(window.navigator, "languages", {
      configurable: true,
      value: [],
    });
    expect(getLocaleCountryCode()).toBeNull();
  });
});

describe("findClosestLocaleStation", () => {
  it("picks the local channel nearest the country's centre", () => {
    const stations = [
      station("far", "FR", [-1.55, 47.22]),
      station("near", "FR", [2.35, 48.85]),
      station("elsewhere", "JP", [139.69, 35.68]),
    ];
    expect(findClosestLocaleStation(stations, "fr")?.id).toBe("near");
  });

  it("falls back to the first local channel when none are geotagged", () => {
    const stations = [station("a", "US"), station("b", "US")];
    expect(findClosestLocaleStation(stations, "US")?.id).toBe("a");
  });

  it("returns null when the country is unknown or absent from the catalog", () => {
    expect(findClosestLocaleStation([station("a", "US")], null)).toBeNull();
    expect(findClosestLocaleStation([station("a", "US")], "DE")).toBeNull();
  });
});
