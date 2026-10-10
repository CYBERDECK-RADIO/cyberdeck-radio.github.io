import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchSomaChannels, filterSomaChannels, resetSomaChannelsCache } from "./somafm";

const makeResponse = (body: unknown, init?: ResponseInit): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });

const channels = {
  channels: [
    {
      id: "beatblender",
      title: "Beat Blender",
      description: "A late night blend of deep-house and downtempo chill.",
      genre: "electronic|chill",
      dj: "DJ Shawn",
    },
    {
      id: "dronezone",
      title: "Drone Zone",
      genre: "ambient",
    },
  ],
};

describe("SomaFM source", () => {
  beforeEach(() => {
    resetSomaChannelsCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes the channel directory into the app station model", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(makeResponse(channels))),
    );

    const stations = await fetchSomaChannels();

    expect(stations).toEqual([
      {
        id: "soma:beatblender",
        name: "Beat Blender",
        genres: ["electronic", "chill"],
        streams: [
          { url: "https://ice2.somafm.com/beatblender-128-mp3", codec: "MP3", bitrate: 128 },
        ],
        homepage: "https://somafm.com/beatblender/",
        checkUrl: "https://somafm.com/beatblender.pls",
      },
      {
        id: "soma:dronezone",
        name: "Drone Zone",
        genres: ["ambient"],
        streams: [
          { url: "https://ice2.somafm.com/dronezone-128-mp3", codec: "MP3", bitrate: 128 },
        ],
        homepage: "https://somafm.com/dronezone/",
        checkUrl: "https://somafm.com/dronezone.pls",
      },
    ]);
  });

  it("filters channels client-side by title, genre, or homepage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(makeResponse(channels))),
    );

    const stations = await fetchSomaChannels();

    expect(filterSomaChannels(stations, "blender").map((station) => station.id)).toEqual([
      "soma:beatblender",
    ]);
    expect(filterSomaChannels(stations, "AMBIENT").map((station) => station.id)).toEqual([
      "soma:dronezone",
    ]);
    expect(filterSomaChannels(stations, "   ")).toHaveLength(2);
    expect(filterSomaChannels(stations, "nope")).toHaveLength(0);
  });

  it("surfaces provider failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(makeResponse({ error: "nope" }, { status: 503 }))),
    );

    await expect(fetchSomaChannels()).rejects.toThrow(
      "SomaFM channels are temporarily unavailable",
    );
  });

  it("passes the caller abort signal to the request", async () => {
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

    const pending = fetchSomaChannels({ signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});