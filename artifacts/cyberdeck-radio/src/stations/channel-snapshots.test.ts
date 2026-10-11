// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createSnapshotStore,
  sanitizeStation,
} from "./channel-snapshots";
import type Station from "./types";

const STORAGE_KEY = "cyberdeck-radio:test-snapshots";

function makeStation(index: number): Station {
  return {
    id: `station-${index}`,
    name: `Station ${index}`,
    country: "France",
    genres: ["world"],
    coordinates: [2.35, 48.85],
    streams: [{ url: `https://stream.example/${index}`, codec: "mp3", bitrate: 128 }],
  };
}

describe("sanitizeStation", () => {
  it("keeps a well-formed channel and its optional fields", () => {
    const sanitized = sanitizeStation({
      id: "alpha",
      name: "Alpha Wave",
      country: "France",
      countryCode: "FR",
      state: "Île-de-France",
      city: "Paris",
      genres: ["world", "", 7],
      coordinates: [2.35, 48.85],
      streams: [{ url: "https://stream.example/alpha", codec: "mp3", bitrate: 128 }],
      homepage: "https://alpha.example",
      checkUrl: "https://alpha.example/check",
    });

    expect(sanitized).toEqual({
      id: "alpha",
      name: "Alpha Wave",
      country: "France",
      countryCode: "FR",
      state: "Île-de-France",
      city: "Paris",
      genres: ["world"],
      coordinates: [2.35, 48.85],
      streams: [{ url: "https://stream.example/alpha", codec: "mp3", bitrate: 128 }],
      homepage: "https://alpha.example",
      checkUrl: "https://alpha.example/check",
    });
  });

  it("drops records that could never identify or play a channel", () => {
    expect(sanitizeStation(null)).toBeNull();
    expect(sanitizeStation("alpha")).toBeNull();
    expect(sanitizeStation({ name: "No id", streams: [{ url: "https://x" }] })).toBeNull();
    expect(sanitizeStation({ id: "alpha" })).toBeNull();
    expect(sanitizeStation({ id: "alpha", name: "Alpha", streams: [] })).toBeNull();
    expect(sanitizeStation({ id: "alpha", name: "Alpha", streams: [{ codec: "mp3" }] })).toBeNull();
  });

  it("salvages the usable parts of a partly damaged record", () => {
    const sanitized = sanitizeStation({
      id: "alpha",
      name: 42,
      genres: "world",
      coordinates: ["2.35", 48.85],
      streams: [{ codec: "mp3" }, { url: "https://stream.example/alpha" }, "broken"],
    });

    expect(sanitized).toEqual({
      id: "alpha",
      name: "",
      genres: [],
      streams: [{ url: "https://stream.example/alpha" }],
    });
  });
});

describe("createSnapshotStore", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("keeps a stable snapshot reference until the list actually changes", () => {
    const store = createSnapshotStore({ storageKey: STORAGE_KEY, limit: 5 });
    const first = store.getSnapshot();
    expect(store.getSnapshot()).toBe(first);

    store.add(makeStation(1));
    const second = store.getSnapshot();
    expect(second).not.toBe(first);
    expect(store.getSnapshot()).toBe(second);
    expect(first).toHaveLength(0);
    expect(second).toHaveLength(1);
  });

  it("prepends channels and never lists the same id twice", () => {
    const store = createSnapshotStore({ storageKey: STORAGE_KEY, limit: 5 });
    store.add(makeStation(1));
    store.add(makeStation(2));
    store.add(makeStation(1));

    expect(store.getSnapshot().map((station) => station.id)).toEqual(["station-1", "station-2"]);
    expect(store.has("station-1")).toBe(true);
    expect(store.get("station-2")?.name).toBe("Station 2");
    expect(store.get("missing")).toBeNull();
  });

  it("is a no-op when the channel is already the newest entry", () => {
    const store = createSnapshotStore({ storageKey: STORAGE_KEY, limit: 5 });
    expect(store.add(makeStation(1))).toBe(true);
    const snapshot = store.getSnapshot();

    expect(store.add(makeStation(1))).toBe(false);
    expect(store.getSnapshot()).toBe(snapshot);
  });

  it("evicts the oldest channels past the cap", () => {
    const store = createSnapshotStore({ storageKey: STORAGE_KEY, limit: 3 });
    for (let index = 1; index <= 5; index += 1) store.add(makeStation(index));

    expect(store.getSnapshot().map((station) => station.id)).toEqual([
      "station-5",
      "station-4",
      "station-3",
    ]);
  });

  it("removes channels and reports whether anything changed", () => {
    const store = createSnapshotStore({ storageKey: STORAGE_KEY, limit: 5 });
    store.add(makeStation(1));

    expect(store.remove("station-1")).toBe(true);
    expect(store.remove("station-1")).toBe(false);
    expect(store.getSnapshot()).toHaveLength(0);
  });

  it("notifies subscribers once per change and stops after unsubscribing", () => {
    const store = createSnapshotStore({ storageKey: STORAGE_KEY, limit: 5 });
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.add(makeStation(1));
    store.add(makeStation(1));
    unsubscribe();
    store.add(makeStation(2));

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("restores the persisted list from storage", () => {
    const writer = createSnapshotStore({ storageKey: STORAGE_KEY, limit: 5 });
    writer.add(makeStation(1));
    writer.add(makeStation(2));

    const reader = createSnapshotStore({ storageKey: STORAGE_KEY, limit: 5 });
    expect(reader.getSnapshot().map((station) => station.id)).toEqual([
      "station-2",
      "station-1",
    ]);
  });

  it("starts empty when the stored blob is corrupt or unreadable", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not json");
    expect(
      createSnapshotStore({ storageKey: STORAGE_KEY, limit: 5 }).getSnapshot(),
    ).toHaveLength(0);

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ids: ["station-1"] }));
    expect(
      createSnapshotStore({ storageKey: STORAGE_KEY, limit: 5 }).getSnapshot(),
    ).toHaveLength(0);
  });

  it("drops stored entries that no longer parse as channels", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([null, { id: "", streams: [{ url: "https://x" }] }, makeStation(1)]),
    );

    expect(
      createSnapshotStore({ storageKey: STORAGE_KEY, limit: 5 })
        .getSnapshot()
        .map((station) => station.id),
    ).toEqual(["station-1"]);
  });

  it("clear() empties both the list and the persisted blob", () => {
    const store = createSnapshotStore({ storageKey: STORAGE_KEY, limit: 5 });
    store.add(makeStation(1));
    store.clear();

    expect(store.getSnapshot()).toHaveLength(0);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("survives storage being unavailable", () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("quota exceeded");
      });
    const store = createSnapshotStore({ storageKey: STORAGE_KEY, limit: 5 });

    expect(store.add(makeStation(1))).toBe(true);
    expect(store.getSnapshot()).toHaveLength(1);
    setItem.mockRestore();
  });
});
