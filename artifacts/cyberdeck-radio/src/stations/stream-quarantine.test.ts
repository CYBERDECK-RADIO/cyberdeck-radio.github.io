// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getQuarantineSnapshot,
  isQuarantined,
  quarantineChannel,
  QUARANTINE_STORAGE_KEY,
  resetQuarantine,
  restoreChannel,
  subscribeQuarantine,
} from "./stream-quarantine";

describe("stream quarantine", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetQuarantine();
  });

  afterEach(() => {
    resetQuarantine();
    window.localStorage.clear();
  });

  it("hides a quarantined channel and persists the id", () => {
    quarantineChannel("station-1");

    expect(isQuarantined("station-1")).toBe(true);
    expect(getQuarantineSnapshot().has("station-1")).toBe(true);
    expect(JSON.parse(window.localStorage.getItem(QUARANTINE_STORAGE_KEY)!)).toEqual([
      "station-1",
    ]);
  });

  it("restores a channel back into the records and clears the persisted id", () => {
    quarantineChannel("station-1");
    restoreChannel("station-1");

    expect(isQuarantined("station-1")).toBe(false);
    expect(JSON.parse(window.localStorage.getItem(QUARANTINE_STORAGE_KEY)!)).toEqual([]);
  });

  it("notifies subscribers only when the set actually changes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeQuarantine(listener);

    quarantineChannel("station-1");
    expect(listener).toHaveBeenCalledTimes(1);

    quarantineChannel("station-1");
    expect(listener).toHaveBeenCalledTimes(1);

    restoreChannel("station-1");
    expect(listener).toHaveBeenCalledTimes(2);

    restoreChannel("station-1");
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    quarantineChannel("station-2");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("keeps a stable snapshot reference until the set changes", () => {
    const before = getQuarantineSnapshot();
    expect(getQuarantineSnapshot()).toBe(before);

    quarantineChannel("station-1");
    expect(getQuarantineSnapshot()).not.toBe(before);
  });

  it("rehydrates quarantined ids from storage on a fresh load", async () => {
    quarantineChannel("station-a");
    quarantineChannel("station-b");

    vi.resetModules();
    const fresh = await import("./stream-quarantine");
    expect(fresh.isQuarantined("station-a")).toBe(true);
    expect(fresh.isQuarantined("station-b")).toBe(true);
    fresh.resetQuarantine();
  });

  it("ignores corrupt storage instead of throwing", async () => {
    window.localStorage.setItem(QUARANTINE_STORAGE_KEY, "{not json");
    vi.resetModules();
    const fresh = await import("./stream-quarantine");
    expect(fresh.getQuarantineSnapshot().size).toBe(0);

    window.localStorage.setItem(QUARANTINE_STORAGE_KEY, JSON.stringify({ nope: true }));
    vi.resetModules();
    const freshAgain = await import("./stream-quarantine");
    expect(freshAgain.getQuarantineSnapshot().size).toBe(0);
  });
});
