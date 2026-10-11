import { describe, expect, it } from "vitest";

import {
  MARKER_BUDGET,
  buildStationMarkers,
  clusterRadius,
  dominantCountry,
  findSeparationScale,
  formatMarkerCount,
  pointsSeparateAtScale,
  project,
} from "./station-markers";
import type Station from "../stations/types";

function station(id: string, coordinates?: [number, number], country?: string): Station {
  return {
    id,
    name: id,
    genres: [],
    streams: [{ url: `https://stream.example/${id}` }],
    ...(country ? { country } : {}),
    ...(coordinates ? { coordinates } : {}),
  };
}

const WORLD_VIEW = { x: 0, y: 0, scale: 1 };

describe("project", () => {
  it("maps the corners of the world onto the 1000x500 sheet", () => {
    expect(project(-180, 90)).toEqual({ x: 0, y: 0 });
    expect(project(180, -90)).toEqual({ x: 1000, y: 500 });
    expect(project(0, 0)).toEqual({ x: 500, y: 250 });
  });
});

describe("buildStationMarkers", () => {
  it("skips stations without usable coordinates", () => {
    const markers = buildStationMarkers(
      [station("mapped", [2.35, 48.85]), station("ghost")],
      WORLD_VIEW,
    );

    expect(markers).toHaveLength(1);
    expect(markers[0].kind).toBe("station");
  });

  it("clusters channels that share a city and keeps lone channels as pips", () => {
    const markers = buildStationMarkers(
      [
        station("paris-1", [2.35, 48.85], "France"),
        station("paris-2", [2.36, 48.86], "France"),
        station("tokyo-1", [139.69, 35.68], "Japan"),
      ],
      WORLD_VIEW,
    );

    const clusters = markers.filter((marker) => marker.kind === "cluster");
    const pips = markers.filter((marker) => marker.kind === "station");
    expect(clusters).toHaveLength(1);
    expect(clusters[0].kind === "cluster" && clusters[0].count).toBe(2);
    expect(pips).toHaveLength(1);
  });

  it("holds the marker count under the budget for a dense catalog", () => {
    const stations: Station[] = [];
    for (let index = 0; index < 4000; index += 1) {
      // One very busy metro plus a long tail of world-wide channels.
      stations.push(station(`metro-${index}`, [2.35 + (index % 40) * 0.01, 48.85 + (index % 40) * 0.01]));
      stations.push(station(`world-${index}`, [(index * 37) % 358 - 179, ((index * 17) % 170) - 85]));
    }

    const markers = buildStationMarkers(stations, WORLD_VIEW);
    expect(markers.length).toBeLessThanOrEqual(MARKER_BUDGET);
    const covered = markers.reduce(
      (total, marker) => total + (marker.kind === "cluster" ? marker.count : 1),
      0,
    );
    expect(covered).toBe(stations.length);
  });

  it("culls everything outside the padded viewport at high zoom", () => {
    const view = { x: -500 * 4, y: -250 * 4, scale: 4 };
    const markers = buildStationMarkers(
      [station("centre", [0, 0]), station("far", [150, 60])],
      view,
    );

    expect(markers.map((marker) => marker.kind)).toEqual(["station"]);
    expect(markers[0].kind === "station" && markers[0].station.id).toBe("centre");
  });

  it("always emits the locked station as its own pip, above every cluster", () => {
    const markers = buildStationMarkers(
      [
        station("paris-1", [2.35, 48.85]),
        station("paris-2", [2.36, 48.86]),
        station("paris-locked", [2.35, 48.85]),
      ],
      WORLD_VIEW,
      { selectedId: "paris-locked" },
    );

    const last = markers[markers.length - 1];
    expect(last.kind).toBe("station");
    expect(last.kind === "station" && last.station.id).toBe("paris-locked");

    const cluster = markers.find((marker) => marker.kind === "cluster");
    expect(cluster?.kind === "cluster" && cluster.count).toBe(2);
  });
});

describe("cluster helpers", () => {
  it("names the country a cluster mostly belongs to", () => {
    expect(
      dominantCountry([
        station("a", undefined, "France"),
        station("b", undefined, "France"),
        station("c", undefined, "Japan"),
        station("d"),
      ]),
    ).toBe("France");
    expect(dominantCountry([station("a")])).toBeNull();
  });

  it("grows bubbles with density but keeps them bounded", () => {
    expect(clusterRadius(2)).toBeLessThan(clusterRadius(64));
    expect(clusterRadius(64)).toBeLessThan(clusterRadius(4096));
    expect(clusterRadius(100_000)).toBeLessThanOrEqual(26);
  });

  it("compacts the bubble read-out", () => {
    expect(formatMarkerCount(842)).toBe("842");
    expect(formatMarkerCount(1200)).toBe("1.2k");
    expect(formatMarkerCount(38_324)).toBe("38k");
  });
});

describe("separation scale", () => {
  // Four channels seven world-units apart: inside one 34px cell at world zoom,
  // but clear of each other by ~4.9× — the regional cluster a deep dive can split.
  const spread = [
    { x: 514, y: 250 },
    { x: 521, y: 250 },
    { x: 528, y: 250 },
    { x: 535, y: 250 },
  ];
  const stacked = [
    { x: 514, y: 250 },
    { x: 514, y: 250 },
  ];

  it("reads the clustering grid to tell crowded from clear", () => {
    expect(pointsSeparateAtScale(spread, 1)).toBe(false);
    expect(pointsSeparateAtScale(spread, 5)).toBe(true);
    expect(pointsSeparateAtScale(stacked, 6)).toBe(false);
    expect(pointsSeparateAtScale([{ x: 0, y: 0 }], 1)).toBe(true);
  });

  it("finds the zoom that splits a spread cluster", () => {
    const scale = findSeparationScale(spread, 1, 6);
    expect(scale).not.toBeNull();
    expect(scale!).toBeGreaterThan(1);
    expect(scale!).toBeLessThanOrEqual(6);
    expect(pointsSeparateAtScale(spread, scale!)).toBe(true);
  });

  it("refuses to invent a zoom for co-located city channels", () => {
    expect(findSeparationScale(stacked, 1, 6)).toBeNull();
    // A single shared point is the Radio Garden crawl's normal city shape.
    expect(findSeparationScale([{ x: 10, y: 10 }, { x: 10, y: 10 }], 1, 8)).toBeNull();
  });

  it("returns the floor zoom when the points already sit apart", () => {
    expect(findSeparationScale(spread, 5, 6)).toBe(5);
  });

  it("has no answer when the zoom window is empty", () => {
    expect(findSeparationScale(spread, 6, 6)).toBeNull();
    expect(findSeparationScale(spread, 6, 1)).toBeNull();
    expect(findSeparationScale([{ x: 1, y: 1 }], 1, 6)).toBeNull();
  });
});
