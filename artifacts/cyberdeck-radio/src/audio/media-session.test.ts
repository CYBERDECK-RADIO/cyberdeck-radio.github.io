import { describe, expect, it, vi } from "vitest";

import {
  getMediaSession,
  syncMediaSession,
  toMediaMetadata,
  toMediaSessionPlaybackState,
  type MediaSessionLike,
} from "./media-session";
import type Station from "@/stations/types";

function station(overrides: Partial<Station> = {}): Station {
  return {
    id: "s1",
    name: "Night Drive FM",
    country: "Japan",
    countryCode: "JP",
    genres: ["synthwave", "city pop"],
    streams: [{ url: "https://secure.example/live", codec: "MP3", bitrate: 192 }],
    ...overrides,
  };
}

function fakeSession(): MediaSessionLike & { handlers: Record<string, () => void> } {
  const handlers: Record<string, () => void> = {};
  return {
    metadata: null,
    playbackState: "none",
    handlers,
    setActionHandler(action, handler) {
      if (handler) handlers[action] = handler;
      else delete handlers[action];
    },
  };
}

describe("toMediaMetadata", () => {
  it("maps station fields to metadata", () => {
    expect(toMediaMetadata(station())).toEqual({
      title: "Night Drive FM",
      artist: "Japan",
      album: "synthwave · city pop",
    });
  });

  it("falls back to country code, empty genres, and null station", () => {
    expect(toMediaMetadata(station({ country: undefined, genres: [] }))).toEqual({
      title: "Night Drive FM",
      artist: "JP",
      album: "Radio Atlas",
    });
    expect(toMediaMetadata(null)).toBeNull();
  });
});

describe("toMediaSessionPlaybackState", () => {
  it("maps playback status to media session state", () => {
    expect(toMediaSessionPlaybackState("playing")).toBe("playing");
    expect(toMediaSessionPlaybackState("paused")).toBe("paused");
    expect(toMediaSessionPlaybackState("loading")).toBe("none");
    expect(toMediaSessionPlaybackState("idle")).toBe("none");
    expect(toMediaSessionPlaybackState("error")).toBe("none");
  });
});

describe("syncMediaSession", () => {
  it("no-ops without a media session", () => {
    expect(() =>
      syncMediaSession(null, {
        station: station(),
        playback: { status: "idle" },
        actions: { play: vi.fn(), pause: vi.fn(), stop: vi.fn() },
      }),
    ).not.toThrow();
  });

  it("sets metadata, playback state, and action handlers", () => {
    const session = fakeSession();
    const actions = { play: vi.fn(), pause: vi.fn(), stop: vi.fn() };
    syncMediaSession(session, {
      station: station(),
      playback: { status: "playing", station: station(), streamIndex: 0 },
      actions,
    });

    expect(session.metadata).toEqual({
      title: "Night Drive FM",
      artist: "Japan",
      album: "synthwave · city pop",
    });
    expect(session.playbackState).toBe("playing");

    session.handlers.play();
    session.handlers.pause();
    session.handlers.stop();
    expect(actions.play).toHaveBeenCalledTimes(1);
    expect(actions.pause).toHaveBeenCalledTimes(1);
    expect(actions.stop).toHaveBeenCalledTimes(1);
  });

  it("clears metadata when no station is selected", () => {
    const session = fakeSession();
    session.metadata = { stale: true };
    syncMediaSession(session, {
      station: null,
      playback: { status: "idle" },
      actions: { play: vi.fn(), pause: vi.fn(), stop: vi.fn() },
    });
    expect(session.metadata).toBeNull();
    expect(session.playbackState).toBe("none");
  });

  it("uses the injected metadata factory when provided", () => {
    const session = fakeSession();
    const createMetadata = vi.fn((metadata) => ({ wrapped: metadata }));
    syncMediaSession(session, {
      station: station(),
      playback: { status: "idle" },
      actions: { play: vi.fn(), pause: vi.fn(), stop: vi.fn() },
      createMetadata,
    });
    expect(createMetadata).toHaveBeenCalledWith({
      title: "Night Drive FM",
      artist: "Japan",
      album: "synthwave · city pop",
    });
    expect(session.metadata).toEqual({
      wrapped: {
        title: "Night Drive FM",
        artist: "Japan",
        album: "synthwave · city pop",
      },
    });
  });
});

describe("getMediaSession", () => {
  it("returns null when the API is unavailable", () => {
    expect(getMediaSession()).toBeNull();
  });
});
