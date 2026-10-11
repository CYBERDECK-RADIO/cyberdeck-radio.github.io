import { afterEach, describe, expect, it, vi } from "vitest";

import { resetGardenStationsCache } from "./radio-garden";
import { resetSomaChannelsCache } from "./somafm";
import { listStationSources, STATION_SOURCES } from "./sources";

describe("station sources", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetSomaChannelsCache();
    resetGardenStationsCache();
  });

  it("lists the airwaves, soma, and garden catalogs", () => {
    expect(listStationSources().map((source) => source.id)).toEqual([
      "airwaves",
      "soma",
      "garden",
    ]);
    expect(STATION_SOURCES.airwaves.global).toBe(true);
    expect(STATION_SOURCES.soma.global).toBe(false);
    expect(STATION_SOURCES.garden.global).toBe(true);
  });

  it("routes a query to the radio-browser provider", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify([
            { stationuuid: "x", name: "n", url: "https://s.example/a" },
          ]),
          { headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const stations = await STATION_SOURCES.airwaves.getStations({ query: "jazz" });

    expect(stations).toHaveLength(1);
    const urls = fetchMock.mock.calls.map(
      ([requestUrl]: [URL]) => new URL(requestUrl.toString()).searchParams,
    );
    expect(urls.length).toBe(4);
    expect(urls.some((params) => params.get("name") === "jazz")).toBe(true);
    expect(urls.some((params) => params.get("state") === "jazz")).toBe(true);
  });

  it("serves the soma catalog when no query is given", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              channels: [{ id: "salt", title: "Secret Agent", genre: "downtempo|electronic" }],
            }),
            { headers: { "Content-Type": "application/json" } },
          ),
        ),
      ),
    );

    const stations = await STATION_SOURCES.soma.getStations({});

    expect(stations).toEqual([
      {
        id: "soma:salt",
        name: "Secret Agent",
        genres: ["downtempo", "electronic"],
        streams: [{ url: "https://ice2.somafm.com/salt-128-mp3", codec: "MP3", bitrate: 128 }],
        homepage: "https://somafm.com/salt/",
        checkUrl: "https://somafm.com/salt.pls",
      },
    ]);
  });

  it("serves the scraped Radio Garden catalog", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
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
            { headers: { "Content-Type": "application/json" } },
          ),
        ),
      ),
    );

    const stations = await STATION_SOURCES.garden.getStations({});

    expect(stations).toEqual([
      {
        id: "garden:abc",
        name: "Jazz Con Class Radio",
        country: "United States",
        countryCode: "US",
        coordinates: [-73.98, 40.75],
        genres: [],
        streams: [{ url: "https://stream.example/jazz" }],
      },
    ]);
  });
});