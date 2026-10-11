import { describe, expect, it } from "vitest";

import {
  FM_BAND_MAX,
  FM_BAND_MIN,
  formatFrequency,
  frequencyPercent,
  nearestStationByFrequency,
  stationFrequency,
} from "./frequency";

describe("stationFrequency", () => {
  it("keeps a station on a stable position in the FM band", () => {
    const first = stationFrequency("abc-123");
    expect(first).toBe(stationFrequency("abc-123"));
    expect(first).toBeGreaterThanOrEqual(FM_BAND_MIN);
    expect(first).toBeLessThanOrEqual(FM_BAND_MAX);
  });

  it("resolves to two decimals (the 0.05 MHz dial step)", () => {
    for (const id of ["a", "somafm-dronezone", "station-99"]) {
      const decimals = String(stationFrequency(id)).split(".")[1] ?? "";
      expect(decimals.length).toBeLessThanOrEqual(2);
    }
  });

  it("spreads different stations across the band", () => {
    const values = new Set(
      ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"].map(stationFrequency),
    );
    expect(values.size).toBeGreaterThan(1);
  });
});

describe("formatFrequency", () => {
  it("always shows two decimals", () => {
    expect(formatFrequency(90.5)).toBe("90.50");
    expect(formatFrequency(108)).toBe("108.00");
  });
});

describe("frequencyPercent", () => {
  it("maps the band edges to 0 and 100", () => {
    expect(frequencyPercent(FM_BAND_MIN)).toBe(0);
    expect(frequencyPercent(FM_BAND_MAX)).toBe(100);
  });

  it("clamps out-of-band values", () => {
    expect(frequencyPercent(70)).toBe(0);
    expect(frequencyPercent(120)).toBe(100);
  });
});

describe("nearestStationByFrequency", () => {
  const stations = [{ id: "alpha" }, { id: "beta" }, { id: "gamma" }];

  it("picks the station whose carrier sits closest to the dial", () => {
    const lowest = stations.reduce((best, station) =>
      stationFrequency(station.id) <= stationFrequency(best.id) ? station : best,
    );
    expect(nearestStationByFrequency(stations, stationFrequency(lowest.id))?.id).toBe(
      lowest.id,
    );
    expect(nearestStationByFrequency(stations, FM_BAND_MIN)?.id).toBe(lowest.id);
  });

  it("returns null for an empty band", () => {
    expect(nearestStationByFrequency([], 99.1)).toBeNull();
  });
});
