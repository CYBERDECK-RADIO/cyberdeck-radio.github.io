import { describe, expect, it } from "vitest";

import type Station from "./types";
import { pickRandomStation } from "./random-station";

function station(id: string): Station {
  return {
    id,
    name: id,
    genres: [],
    streams: [{ url: `https://stream.example/${id}` }],
  };
}

const stations = [station("a"), station("b"), station("c")];

describe("pickRandomStation", () => {
  it("returns null for an empty pool", () => {
    expect(pickRandomStation([])).toBeNull();
  });

  it("maps the RNG sample onto the pool", () => {
    expect(pickRandomStation(stations, { random: () => 0 })?.id).toBe("a");
    expect(pickRandomStation(stations, { random: () => 0.34 })?.id).toBe("b");
    expect(pickRandomStation(stations, { random: () => 0.99 })?.id).toBe("c");
  });

  it("clamps an out-of-range sample instead of returning undefined", () => {
    expect(pickRandomStation(stations, { random: () => 1 })?.id).toBe("c");
    expect(pickRandomStation(stations, { random: () => -1 })?.id).toBe("a");
  });

  it("skips the currently tuned station when anything else is available", () => {
    expect(pickRandomStation(stations, { excludeId: "b", random: () => 0 })?.id).toBe("a");
    expect(pickRandomStation(stations, { excludeId: "b", random: () => 0.99 })?.id).toBe("c");
  });

  it("falls back to the only candidate when it is also the excluded one", () => {
    expect(pickRandomStation([station("solo")], { excludeId: "solo" })?.id).toBe("solo");
  });
});
