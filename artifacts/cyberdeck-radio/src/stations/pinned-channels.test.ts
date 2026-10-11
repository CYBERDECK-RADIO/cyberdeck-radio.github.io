// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MAX_PINNED_CHANNELS,
  PINNED_CHANNELS_STORAGE_KEY,
  getPinnedChannelsSnapshot,
  getPinnedChannel,
  isChannelPinned,
  pinChannel,
  resetPinnedChannels,
  subscribePinnedChannels,
  togglePinnedChannel,
  unpinChannel,
} from "./pinned-channels";
import type Station from "./types";

function station(index: number): Station {
  return {
    id: `station-${index}`,
    name: `Station ${index}`,
    genres: ["world"],
    streams: [{ url: `https://stream.example/${index}` }],
  };
}

describe("pinned channels", () => {
  beforeEach(() => {
    resetPinnedChannels();
    window.localStorage.clear();
  });

  it("pins, reports, and lifts a channel", () => {
    pinChannel(station(1));

    expect(isChannelPinned("station-1")).toBe(true);
    expect(getPinnedChannel("station-1")?.name).toBe("Station 1");
    expect(getPinnedChannelsSnapshot()).toHaveLength(1);

    unpinChannel("station-1");
    expect(isChannelPinned("station-1")).toBe(false);
    expect(getPinnedChannel("station-1")).toBeNull();
  });

  it("toggles a channel and keeps the shelf newest-first", () => {
    expect(togglePinnedChannel(station(1))).toBe(true);
    expect(togglePinnedChannel(station(2))).toBe(true);
    expect(getPinnedChannelsSnapshot().map((item) => item.id)).toEqual([
      "station-2",
      "station-1",
    ]);

    expect(togglePinnedChannel(station(1))).toBe(false);
    expect(getPinnedChannelsSnapshot().map((item) => item.id)).toEqual(["station-2"]);

    expect(togglePinnedChannel(station(1))).toBe(true);
    expect(getPinnedChannelsSnapshot().map((item) => item.id)).toEqual([
      "station-1",
      "station-2",
    ]);
  });

  it("persists pins for the next session", () => {
    pinChannel(station(1));

    expect(
      JSON.parse(window.localStorage.getItem(PINNED_CHANNELS_STORAGE_KEY) ?? "[]"),
    ).toHaveLength(1);

    resetPinnedChannels();
    expect(getPinnedChannelsSnapshot()).toHaveLength(0);
    expect(window.localStorage.getItem(PINNED_CHANNELS_STORAGE_KEY)).toBeNull();
  });

  it("evicts the oldest pins past the shelf cap", () => {
    for (let index = 1; index <= MAX_PINNED_CHANNELS + 2; index += 1) {
      pinChannel(station(index));
    }

    const pinned = getPinnedChannelsSnapshot();
    expect(pinned).toHaveLength(MAX_PINNED_CHANNELS);
    expect(pinned[0].id).toBe(`station-${MAX_PINNED_CHANNELS + 2}`);
    expect(pinned.at(-1)?.id).toBe(`station-3`);
  });

  it("notifies subscribers when a pin is added or lifted", () => {
    const listener = vi.fn();
    const unsubscribe = subscribePinnedChannels(listener);

    pinChannel(station(1));
    unpinChannel("station-1");
    unsubscribe();
    unpinChannel("station-1");

    expect(listener).toHaveBeenCalledTimes(2);
  });
});
