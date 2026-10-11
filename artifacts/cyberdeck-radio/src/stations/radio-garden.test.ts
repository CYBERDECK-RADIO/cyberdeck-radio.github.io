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

async function gzipEncode(text: string): Promise<Uint8Array> {
  const compressed = new Blob([new TextEncoder().encode(text)])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(compressed).arrayBuffer());
}

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
      city: "New York",
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
      city: "Lyon",
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
        city: "New York",
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
        city: "Lyon",
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

  it("filters client-side by name, country, city, or genre", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(makeResponse(catalog))));
    const stations = await fetchGardenStations();

    expect(filterGardenStations(stations, "con class").map((s) => s.id)).toEqual([
      "garden:abc123",
    ]);
    expect(filterGardenStations(stations, "france").map((s) => s.id)).toEqual([
      "garden:def456",
    ]);
    expect(filterGardenStations(stations, "lyon").map((s) => s.id)).toEqual([
      "garden:def456",
    ]);
    expect(filterGardenStations(stations, "jazz new york").map((s) => s.id)).toEqual([
      "garden:abc123",
    ]);
    expect(filterGardenStations(stations, "JAZZ").map((s) => s.id)).toEqual([
      "garden:abc123",
      "garden:def456",
    ]);
    expect(filterGardenStations(stations, "   ")).toHaveLength(2);
    expect(filterGardenStations(stations, "nope")).toHaveLength(0);
  });

  it("keeps the whole catalog reachable for browse and search alike", async () => {
    const many = Array.from({ length: 260 }, (_, index) => ({
      id: `garden:s${index}`,
      name: `Station ${index}`,
      streams: [{ url: `https://stream.example/${index}` }],
    }));
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(makeResponse({ stations: many }))));
    const stations = await fetchGardenStations();

    // The shell pages the directory and clusters the atlas instead.
    expect(filterGardenStations(stations, "")).toHaveLength(260);
    expect(filterGardenStations(stations, "station")).toHaveLength(260);
  });

  it("treats a missing catalog as empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(makeResponse({ error: "missing" }, { status: 404 }))),
    );

    await expect(fetchGardenStations()).resolves.toEqual([]);
  });

  it("fetches and decompresses the gzipped catalog with a single request", async () => {
    const compressed = await gzipEncode(JSON.stringify(catalog));
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(compressed, {
          status: 200,
          headers: { "Content-Type": "application/gzip" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const stations = await fetchGardenStations();

    expect(stations).toHaveLength(2);
    expect(stations[0].name).toBe("Jazz Con Class Radio");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("radio-garden.json.gz");
  });

  it("falls back to the plain JSON catalog when the gzip copy is absent", async () => {
    const fetchMock = vi.fn((url: string | URL) =>
      String(url).endsWith(".gz")
        ? Promise.resolve(new Response("missing", { status: 404 }))
        : Promise.resolve(makeResponse(catalog)),
    );
    vi.stubGlobal("fetch", fetchMock);

    const stations = await fetchGardenStations();

    expect(stations).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("radio-garden.json");
  });

  it("falls back to plain JSON when the gzip copy is undecodable", async () => {
    const badGzip = new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03]);
    const fetchMock = vi.fn((url: string | URL) =>
      String(url).endsWith(".gz")
        ? Promise.resolve(new Response(badGzip, { status: 200, headers: { "Content-Type": "application/gzip" } }))
        : Promise.resolve(makeResponse(catalog)),
    );
    vi.stubGlobal("fetch", fetchMock);

    const stations = await fetchGardenStations();

    expect(stations).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
