import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchGardenStations,
  filterGardenStations,
  resetGardenStationsCache,
} from "./radio-garden";

const makeResponse = (body: unknown, init?: ResponseInit): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });

const catalog = {
  generatedAt: "2026-01-01T00:00:00.000Z",
  source: "radio.garden",
  count: 2,
  stations: [
    {
      id: "garden:abc123",
      name: "Jazz Con Class Radio",
      country: "United States",
      countryCode: "US",
      coordinates: [-73.98, 40.75],
      genres: [],
      streams: [
        { url: "https://stream.example/jazz" },
        { url: "https://radio.garden/api/ara/content/listen/abc123/channel.mp3" },
      ],
    },
    {
      id: "garden:def456",
      name: "Jazz Radio",
      country: "France",
      countryCode: "FR",
      coordinates: [4.83, 45.75],
      genres: ["jazz"],
      streams: [{ url: "https://stream.example/fr" }],
    },
  ],
};

describe("Radio Garden source", () => {
  beforeEach(() => {
    resetGardenStationsCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes the scraped catalog into the app station model", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(makeResponse(catalog))));

    const stations = await fetchGardenStations();

    expect(stations).toEqual([
      {
        id: "garden:abc123",
        name: "Jazz Con Class Radio",
        country: "United States",
        countryCode: "US",
        coordinates: [-73.98, 40.75],
        genres: [],
        streams: [
          { url: "https://stream.example/jazz" },
          { url: "https://radio.garden/api/ara/content/listen/abc123/channel.mp3" },
        ],
      },
      {
        id: "garden:def456",
        name: "Jazz Radio",
        country: "France",
        countryCode: "FR",
        coordinates: [4.83, 45.75],
        genres: ["jazz"],
        streams: [{ url: "https://stream.example/fr" }],
      },
    ]);
  });

  it("drops malformed records and non-web streams", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          makeResponse({
            stations: [
              { id: "garden:ok", name: "Keep Me", streams: [{ url: "https://ok.example/a" }] },
              { id: "garden:nostream", name: "No Stream", streams: [] },
              { id: "garden:badurl", name: "Bad", streams: [{ url: "ftp://nope" }] },
              { id: "garden:badd", name: "Bad Coords", coordinates: [200, 100], streams: [{ url: "https://ok.example/b" }] },
              { name: "No Id", streams: [{ url: "https://ok.example/c" }] },
              "not a record",
            ],
          }),
        ),
      ),
    );

    const stations = await fetchGardenStations();

    expect(stations.map((station) => station.id)).toEqual(["garden:ok", "garden:badd"]);
    expect(stations[1].coordinates).toBeUndefined();
  });

  it("deduplicates repeated stream urls", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          makeResponse({
            stations: [
              {
                id: "garden:dup",
                name: "Dup",
                streams: [
                  { url: "https://same.example/stream" },
                  { url: "https://same.example/stream" },
                ],
              },
            ],
          }),
        ),
      ),
    );

    const stations = await fetchGardenStations();

    expect(stations[0].streams).toEqual([{ url: "https://same.example/stream" }]);
  });

  it("filters client-side by name, country, or genre", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(makeResponse(catalog))));
    const stations = await fetchGardenStations();

    expect(filterGardenStations(stations, "con class").map((s) => s.id)).toEqual([
      "garden:abc123",
    ]);
    expect(filterGardenStations(stations, "france").map((s) => s.id)).toEqual([
      "garden:def456",
    ]);
    expect(filterGardenStations(stations, "JAZZ").map((s) => s.id)).toEqual([
      "garden:abc123",
      "garden:def456",
    ]);
    expect(filterGardenStations(stations, "   ")).toHaveLength(2);
    expect(filterGardenStations(stations, "nope")).toHaveLength(0);
  });

  it("caps the browse list and search results", async () => {
    const many = Array.from({ length: 260 }, (_, index) => ({
      id: `garden:s${index}`,
      name: `Station ${index}`,
      streams: [{ url: `https://stream.example/${index}` }],
    }));
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(makeResponse({ stations: many }))));
    const stations = await fetchGardenStations();

    expect(filterGardenStations(stations, "")).toHaveLength(200);
    expect(filterGardenStations(stations, "station")).toHaveLength(250);
  });

  it("treats a missing catalog as empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(makeResponse({ error: "missing" }, { status: 404 }))),
    );

    await expect(fetchGardenStations()).resolves.toEqual([]);
  });

  it("surfaces provider failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(makeResponse({ error: "nope" }, { status: 503 }))),
    );

    await expect(fetchGardenStations()).rejects.toThrow(
      "The Radio Garden catalog is temporarily unavailable",
    );
  });

  it("passes the caller abort signal to the request", async () => {
    const fetchMock = vi.fn(
      (_request: string, options: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          options.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    const pending = fetchGardenStations({ signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
