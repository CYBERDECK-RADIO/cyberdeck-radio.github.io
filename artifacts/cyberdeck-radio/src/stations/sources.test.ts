import { afterEach, describe, expect, it, vi } from "vitest";

import { resetGardenStationsCache } from "./radio-garden";
import { resetSomaChannelsCache } from "./somafm";
import { CATALOG_CREDITS, getStations } from "./sources";

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });

afterEach(() => {
  vi.unstubAllGlobals();
  resetSomaChannelsCache();
  resetGardenStationsCache();
});

describe("unified station directory", () => {
  it("credits every contributing catalog", () => {
    expect(CATALOG_CREDITS.map((credit) => credit.label)).toEqual([
      "RADIO.GARDEN",
      "RADIO-BROWSER.INFO",
      "SOMAFM.COM",
    ]);
  });

  it("merges the default listings from every catalog into one group", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: URL | string) => {
        const url = String(input);
        if (url.includes("radio-garden.json")) {
          return Promise.resolve(
            jsonResponse({
              generatedAt: "2026-10-11T00:00:00.000Z",
              count: 1,
              stations: [
                {
                  id: "garden:abc",
                  name: "Jazz Con Class Radio",
                  country: "United States",
                  countryCode: "US",
                  coordinates: [-73.98, 40.75],
                  genres: [],
                  streams: [{ url: "https://stream.example/jazz" }],
                },
              ],
            }),
          );
        }
        if (url.includes("somafm.com/channels.json")) {
          return Promise.resolve(
            jsonResponse({
              channels: [
                {
                  id: "salt",
                  title: "Secret Agent",
                  genre: "downtempo|electronic",
                },
              ],
            }),
          );
        }
        return Promise.resolve(
          jsonResponse([
            {
              stationuuid: "live-1",
              name: "World Service",
              url: "https://stream.example/world",
              tags: "world, news",
              countrycode: "FR",
            },
          ]),
        );
      }),
    );

    const stations = await getStations({});

    expect(stations.map((station) => station.name)).toEqual(
      expect.arrayContaining(["Jazz Con Class Radio", "Secret Agent", "World Service"]),
    );
  });

  it("collapses a station that crosses catalogs under a shared listen URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: URL | string) => {
        const url = String(input);
        if (url.includes("radio-garden.json")) {
          return Promise.resolve(
            jsonResponse({
              generatedAt: "2026-10-11T00:00:00.000Z",
              count: 1,
              stations: [
                {
                  id: "garden:same",
                  name: "Garden Version",
                  countryCode: "FR",
                  genres: [],
                  streams: [{ url: "https://stream.example/twin" }],
                },
              ],
            }),
          );
        }
        if (url.includes("somafm.com/channels.json")) {
          return Promise.resolve(jsonResponse({ channels: [] }));
        }
        return Promise.resolve(
          jsonResponse([
            {
              stationuuid: "live-same",
              name: "Live Version",
              url: "https://stream.example/twin",
              tags: "world",
              countrycode: "FR",
            },
          ]),
        );
      }),
    );

    const stations = await getStations({});

    // One channel, not two: the geotagged crawl wins the de-dupe.
    expect(stations).toHaveLength(1);
    expect(stations[0].id).toBe("garden:same");
    expect(stations[0].name).toBe("Garden Version");
  });

  it("answers a query from every catalog at once", async () => {
    const gardenStation = {
      id: "garden:abc",
      name: "Jazz Con Class Radio",
      country: "United States",
      countryCode: "US",
      genres: [],
      streams: [{ url: "https://stream.example/jazz" }],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: URL | string) => {
        const url = String(input);
        if (url.includes("radio-garden.json")) {
          return Promise.resolve(
            jsonResponse({
              generatedAt: "2026-10-11T00:00:00.000Z",
              count: 1,
              stations: [gardenStation],
            }),
          );
        }
        if (url.includes("somafm.com/channels.json")) {
          return Promise.resolve(
            jsonResponse({
              channels: [
                { id: "flavor", title: "Jazz Flavors", genre: "jazz" },
                { id: "salt", title: "Secret Agent", genre: "downtempo" },
              ],
            }),
          );
        }
        const searchQuery = new URL(url);
        const query = (
          searchQuery.searchParams.get("name") ??
          searchQuery.searchParams.get("tag") ??
          searchQuery.searchParams.get("country") ??
          searchQuery.searchParams.get("state") ??
          ""
        ).toLowerCase();
        const records = [
          {
            stationuuid: "live-jazz",
            name: "Jazz Radio 24",
            url: "https://stream.example/jazz24",
            tags: "jazz",
            countrycode: "US",
          },
          {
            stationuuid: "live-rock",
            name: "Rock Box",
            url: "https://stream.example/rock",
            tags: "rock",
            countrycode: "GB",
          },
        ];
        return Promise.resolve(
          jsonResponse(
            records.filter(
              (record) =>
                record.name.toLowerCase().includes(query) ||
                (record.tags ?? "").includes(query),
            ),
          ),
        );
      }),
    );

    const stations = await getStations({ query: "jazz" });

    expect(stations.map((station) => station.name)).toEqual(
      expect.arrayContaining(["Jazz Con Class Radio", "Jazz Flavors", "Jazz Radio 24"]),
    );
    expect(stations.map((station) => station.name)).not.toContain("Secret Agent");
    expect(stations.map((station) => station.name)).not.toContain("Rock Box");
  });

  it("returns an empty group when no catalog matches a query", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: URL | string) => {
        const url = String(input);
        if (url.includes("radio-garden.json")) {
          return Promise.resolve(
            jsonResponse({
              generatedAt: "2026-10-11T00:00:00.000Z",
              count: 0,
              stations: [],
            }),
          );
        }
        if (url.includes("somafm.com/channels.json")) {
          return Promise.resolve(jsonResponse({ channels: [] }));
        }
        return Promise.resolve(jsonResponse([]));
      }),
    );

    const stations = await getStations({ query: "nothing matches" });

    expect(stations).toEqual([]);
  });
});