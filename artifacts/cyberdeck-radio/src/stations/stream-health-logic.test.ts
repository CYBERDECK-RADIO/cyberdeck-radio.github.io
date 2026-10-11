import { describe, expect, it } from "vitest";

import {
  classifyHealthError,
  classifyHealthResponse,
  isServerSideHealthCheck,
  OFFLINE_CONFIRM_DELAY_MS,
  OFFLINE_RECHECK_MAX_MS,
  OFFLINE_RECHECK_MIN_MS,
  RECHECK_INTERVAL_MS,
  recheckDelayMs,
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

  it("marks a server-resolved http stream as insecure, not live", async () => {
    const checkUrl = "https://de1.api.radio-browser.info/json/url/station-1";

    await expect(
      classifyHealthResponse(
        makeResponse({ ok: true, url: "http://shoutcast.example/stream" }, { status: 200 }),
        checkUrl,
      ),
    ).resolves.toBe("insecure");
  });

  it("keeps a server-resolved https stream live", async () => {
    const checkUrl = "https://de1.api.radio-browser.info/json/url/station-1";

    await expect(
      classifyHealthResponse(
        makeResponse({ ok: true, url: "https://shoutcast.example/stream" }, { status: 200 }),
        checkUrl,
      ),
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

  it("rechecks live and unknown channels on the normal 5-minute cadence", () => {
    expect(recheckDelayMs("live")).toBe(RECHECK_INTERVAL_MS);
    expect(recheckDelayMs("unknown")).toBe(RECHECK_INTERVAL_MS);
  });

  it("holds a quick confirming probe while the offline streak is unconfirmed", () => {
    expect(recheckDelayMs("offline", 1)).toBe(OFFLINE_CONFIRM_DELAY_MS);
  });

  it("spreads confirmed-offline rechecks across the 10–20 minute window", () => {
    expect(recheckDelayMs("offline", 2, () => 0)).toBe(OFFLINE_RECHECK_MIN_MS);
    expect(recheckDelayMs("offline", 2, () => 1)).toBe(OFFLINE_RECHECK_MAX_MS);
    const midpoint = recheckDelayMs("offline", 3, () => 0.5);
    expect(midpoint).toBeGreaterThanOrEqual(OFFLINE_RECHECK_MIN_MS);
    expect(midpoint).toBeLessThanOrEqual(OFFLINE_RECHECK_MAX_MS);
  });
});