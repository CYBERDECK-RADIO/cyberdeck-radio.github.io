import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchTrendingStations, searchStations } from "./radio-browser";

const makeResponse = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });

describe("searchStations", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes provider records into the app station model", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      makeResponse([
        {
          stationuuid: "station-1",
          name: "Night Drive FM",
          url: "http://stream.example/live.mp3",
          url_resolved: "https://stream.example/live.mp3",
          country: "Japan",
          countrycode: "jp",
          tags: "synthwave, electronic, night drive",
          codec: "MP3",
          bitrate: 192,
          geo_lat: 35.68,
          geo_long: 139.69,
          homepage: "https://example.jp",
        },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const stations = await searchStations({ query: "night drive" });

    expect(stations).toEqual([
      {
        id: "station-1",
        name: "Night Drive FM",
        countryCode: "JP",
        country: "Japan",
        genres: ["synthwave", "electronic", "night drive"],
        coordinates: [139.69, 35.68],
        streams: [
          {
            url: "https://stream.example/live.mp3",
            codec: "MP3",
            bitrate: 192,
          },
        ],
        homepage: "https://example.jp/",
        checkUrl: "https://de1.api.radio-browser.info/json/url/station-1",
      },
    ]);
  });

  it("uses the original stream URL when the resolved URL is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        makeResponse([
          {
            stationuuid: "station-2",
            name: "Local Radio",
            url: "https://stream.example/local",
            url_resolved: "",
            tags: "",
            countrycode: "",
            geo_lat: null,
            geo_long: null,
          },
        ]),
      ),
    );

    const [station] = await searchStations({ query: "local" });

    expect(station.streams).toEqual([{ url: "https://stream.example/local" }]);
    expect(station.genres).toEqual([]);
    expect(station.coordinates).toBeUndefined();
    expect(station.countryCode).toBeUndefined();
  });

  it("drops malformed records and duplicate station IDs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        makeResponse([
          {
            stationuuid: "station-3",
            name: "First copy",
            url: "https://stream.example/first",
            tags: "ambient",
          },
          {
            stationuuid: "station-3",
            name: "Duplicate copy",
            url: "https://stream.example/duplicate",
            tags: "ambient",
          },
          {
            stationuuid: "station-4",
            name: "No stream",
            url: "",
            tags: "ambient",
          },
          {
            stationuuid: "station-5",
            name: "",
            url: "https://stream.example/unnamed",
            tags: "ambient",
          },
        ]),
      ),
    );

    const stations = await searchStations({ query: "ambient" });

    expect(stations).toHaveLength(1);
    expect(stations[0]?.name).toBe("First copy");
  });

  it("avoids a request for a blank query", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(searchStations({ query: "   " })).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces provider failures instead of treating them as no results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        makeResponse({ error: "temporarily unavailable" }, { status: 503 }),
      ),
    );

    await expect(searchStations({ query: "jazz" })).rejects.toThrow(
      "Station directory is temporarily unavailable",
    );
  });

  it("passes the caller abort signal and provider query parameters", async () => {
    const fetchMock = vi.fn(
      (_request: URL, options: RequestInit) =>
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

    const pendingSearch = searchStations({
      query: "  jazz  ",
      signal: controller.signal,
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const [requestUrl, requestOptions] of fetchMock.mock.calls) {
      const url = new URL(requestUrl.toString());
      expect(url.hostname).toBe("de1.api.radio-browser.info");
      expect(url.pathname).toBe("/json/stations/search");
      expect(url.searchParams.get("limit")).toBe("30");
      expect(url.searchParams.get("hidebroken")).toBe("true");
      expect(requestOptions.signal).toBeInstanceOf(AbortSignal);
    }
    const requestParams = fetchMock.mock.calls.map(
      ([requestUrl]) => new URL(requestUrl.toString()).searchParams,
    );
    expect(requestParams.map((params) => params.get("name"))).toContain("jazz");
    expect(requestParams.map((params) => params.get("tag"))).toContain("jazz");
    expect(requestParams.map((params) => params.get("country"))).toContain("jazz");

    controller.abort();
    await expect(pendingSearch).rejects.toMatchObject({ name: "AbortError" });
  });

  it("searches station names, genres, and countries, merging duplicate station IDs", async () => {
    const fetchMock = vi.fn((requestUrl: URL) => {
      const params = requestUrl.searchParams;
      const id = params.has("name")
        ? "station-name"
        : params.has("tag")
          ? "station-genre"
          : "station-country";
      const name = params.has("name")
        ? "Jazz FM"
        : params.has("tag")
          ? "Night Lounge"
          : "Japan Jazz";

      return Promise.resolve(
        makeResponse([
          {
            stationuuid: id,
            name,
            url: `https://stream.example/${id}`,
            tags: "jazz",
          },
          {
            stationuuid: "station-name",
            name: "Duplicate",
            url: "https://stream.example/duplicate",
            tags: "jazz",
          },
        ]),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const stations = await searchStations({ query: "jazz" });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(stations.map((station) => station.id)).toEqual([
      "station-name",
      "station-genre",
      "station-country",
    ]);
  });
});

describe("fetchTrendingStations", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests the most-voted geo-tagged stations in one call", async () => {
    const fetchMock = vi.fn((_request: URL | string, _options?: RequestInit) =>
      Promise.resolve(
        makeResponse([
          {
            stationuuid: "trend-1",
            name: "Global Wave",
            url: "https://stream.example/wave",
            tags: "world",
            countrycode: "fr",
            geo_lat: 48.85,
            geo_long: 2.35,
          },
        ]),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const stations = await fetchTrendingStations();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(fetchMock.mock.calls[0]?.[0] as URL | string);
    expect(url.pathname).toBe("/json/stations/search");
    expect(url.searchParams.get("order")).toBe("votes");
    expect(url.searchParams.get("reverse")).toBe("true");
    expect(url.searchParams.get("hidebroken")).toBe("true");
    expect(url.searchParams.get("has_geo_info")).toBe("true");
    expect(url.searchParams.get("limit")).toBe("100");
    expect(stations).toHaveLength(1);
    expect(stations[0]).toMatchObject({
      id: "trend-1",
      name: "Global Wave",
      countryCode: "FR",
      coordinates: [2.35, 48.85],
    });
  });

  it("keeps records without coordinates, leaving them unmapped rather than hidden", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          makeResponse([
            { stationuuid: "no-geo", name: "Landlocked", url: "https://stream.example/a" },
            {
              stationuuid: "geo",
              name: "Harbour FM",
              url: "https://stream.example/b",
              geo_lat: 1,
              geo_long: 2,
            },
          ]),
        ),
      ),
    );

    const stations = await fetchTrendingStations();

    expect(stations.map((station) => station.id)).toEqual(["no-geo", "geo"]);
    expect(stations[0]?.coordinates).toBeUndefined();
    expect(stations[1]?.coordinates).toEqual([2, 1]);
  });

  it("propagates aborts so a cancelled cold open stays silent", async () => {
    const fetchMock = vi.fn(
      (_request: URL, options: RequestInit) =>
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

    const pending = fetchTrendingStations({ signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
