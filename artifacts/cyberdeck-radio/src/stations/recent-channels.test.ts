// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MAX_RECENT_CHANNELS,
  RECENT_CHANNELS_STORAGE_KEY,
  forgetChannel,
  getRecentChannel,
  getRecentChannelsSnapshot,
  isChannelRecent,
  recordChannel,
  resetRecentChannels,
  subscribeRecentChannels,
} from "./recent-channels";
import type Station from "./types";

function station(index: number): Station {
  return {
    id: `station-${index}`,
    name: `Station ${index}`,
    genres: ["world"],
    streams: [{ url: `https://stream.example/${index}` }],
  };
}

describe("recent channels", () => {
  beforeEach(() => {
    resetRecentChannels();
    window.localStorage.clear();
  });

  it("logs a listen", () => {
    recordChannel(station(1));

    expect(isChannelRecent("station-1")).toBe(true);
    expect(getRecentChannel("station-1")?.name).toBe("Station 1");
    expect(getRecentChannelsSnapshot()).toHaveLength(1);
  });

  it("promotes a repeat listen instead of repeating the row", () => {
    recordChannel(station(1));
    recordChannel(station(2));
    recordChannel(station(1));

    expect(getRecentChannelsSnapshot().map((item) => item.id)).toEqual([
      "station-1",
      "station-2",
    ]);
  });

  it("is a no-op when the channel is already the newest entry", () => {
    recordChannel(station(1));
    const listener = vi.fn();
    const unsubscribe = subscribeRecentChannels(listener);

    recordChannel(station(1));
    unsubscribe();

    expect(listener).not.toHaveBeenCalled();
  });

  it("evicts the oldest listens past the log cap", () => {
    for (let index = 1; index <= MAX_RECENT_CHANNELS + 3; index += 1) {
      recordChannel(station(index));
    }

    const recent = getRecentChannelsSnapshot();
    expect(recent).toHaveLength(MAX_RECENT_CHANNELS);
    expect(recent[0].id).toBe(`station-${MAX_RECENT_CHANNELS + 3}`);
    expect(recent.at(-1)?.id).toBe("station-4");
  });

  it("persists the log and can forget a single entry", () => {
    recordChannel(station(1));
    recordChannel(station(2));

    expect(
      JSON.parse(window.localStorage.getItem(RECENT_CHANNELS_STORAGE_KEY) ?? "[]"),
    ).toHaveLength(2);

    forgetChannel("station-2");
    expect(isChannelRecent("station-2")).toBe(false);
    expect(getRecentChannelsSnapshot()).toHaveLength(1);

    resetRecentChannels();
    expect(getRecentChannelsSnapshot()).toHaveLength(0);
    expect(window.localStorage.getItem(RECENT_CHANNELS_STORAGE_KEY)).toBeNull();
  });
});
