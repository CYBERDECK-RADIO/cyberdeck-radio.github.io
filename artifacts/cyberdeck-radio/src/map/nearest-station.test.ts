import { describe, expect, it } from "vitest";
import type Station from "../stations/types";
import { findNearestStation } from "./nearest-station";

function station(id: string, coordinates?: Station["coordinates"]): Station {
  return {
    id,
    name: id,
    coordinates,
    genres: [],
    streams: [{ url: `https://stream.example/${id}` }],
  };
}

describe("findNearestStation", () => {
  it("returns the geographically nearest station with coordinates", () => {
    const stations = [
      station("far", [-105, 40]),
      station("near", [2, 49]),
      station("unlocated"),
    ];

    expect(findNearestStation(stations, [0, 51])?.id).toBe("near");
  });

  it("handles distances across the international date line", () => {
    const stations = [
      station("west", [175, 0]),
      station("east", [-179, 0]),
    ];

    expect(findNearestStation(stations, [179, 0])?.id).toBe("east");
  });

  it("returns null when no station has a valid coordinate", () => {
    const stations = [
      station("missing"),
      station("invalid", [Infinity, 95]),
    ];

    expect(findNearestStation(stations, [0, 0])).toBeNull();
  });
});
