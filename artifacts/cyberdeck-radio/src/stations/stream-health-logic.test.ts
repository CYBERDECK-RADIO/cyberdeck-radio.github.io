import { describe, expect, it } from "vitest";

import {
  classifyHealthError,
  classifyHealthResponse,
  isServerSideHealthCheck,
} from "./stream-health-logic";

const makeResponse = (body: unknown, init?: ResponseInit): Response => {
  const status = init?.status ?? 200;
  return {
    json: async () => body,
    status,
    ok: status >= 200 && status < 300,
    ...init,
  } as unknown as Response;
};

describe("stream health logic", () => {
  it("treats a radio-browser /json/url ok flag as live", async () => {
    const checkUrl = "https://de1.api.radio-browser.info/json/url/station-1";
    expect(isServerSideHealthCheck(checkUrl)).toBe(true);

    await expect(
      classifyHealthResponse(makeResponse({ ok: true }, { status: 200 }), checkUrl),
    ).resolves.toBe("live");
  });

  it("treats a radio-browser failure as offline", async () => {
    const checkUrl = "https://de1.api.radio-browser.info/json/url/station-1";

    await expect(
      classifyHealthResponse(makeResponse({ ok: false }, { status: 404 }), checkUrl),
    ).resolves.toBe("offline");
    await expect(
      classifyHealthResponse(
        makeResponse({ error: "station url offline" }, { status: 200 }),
        checkUrl,
      ),
    ).resolves.toBe("offline");
  });

  it("treats a reachable direct stream as live", async () => {
    const checkUrl = "https://ice2.somafm.com/beatblender-128-mp3";
    expect(isServerSideHealthCheck(checkUrl)).toBe(false);

    await expect(
      classifyHealthResponse(makeResponse("", { status: 206 }), checkUrl),
    ).resolves.toBe("live");
  });

  it("maps a timeout abort to unknown and network failures to offline", () => {
    expect(classifyHealthError(new DOMException("aborted", "AbortError"))).toBe("unknown");
    expect(classifyHealthError(new TypeError("Failed to fetch"), true)).toBe("offline");
    expect(classifyHealthError(new TypeError("Failed to fetch"), false)).toBe("unknown");
  });
});