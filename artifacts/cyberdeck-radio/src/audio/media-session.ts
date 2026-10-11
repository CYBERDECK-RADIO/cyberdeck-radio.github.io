/**
 * Media Session bridging: mirror the tuned station and playback state to the OS
 * lock screen / hardware media keys, and route their actions back to the deck.
 *
 *   station + PlaybackState ──▶ syncMediaSession ──▶ navigator.mediaSession
 *   lock-screen play/pause/stop ──▶ actions ──▶ AudioController
 *
 * The module depends on a tiny structural `MediaSessionLike` rather than the
 * DOM type so it can be exercised with a fake and safely no-ops where the
 * Media Session API is unavailable (jsdom, older browsers).
 */

import type Station from "@/stations/types";
import type { PlaybackState } from "./audio-controller";

export type MediaMetadataLike = {
  title: string;
  artist: string;
  album: string;
};

export type MediaSessionLike = {
  metadata: unknown;
  playbackState: "none" | "paused" | "playing";
  setActionHandler(action: "play" | "pause" | "stop", handler: (() => void) | null): void;
};

export type MediaSessionActions = {
  play: () => void;
  pause: () => void;
  stop: () => void;
};

export type SyncMediaSessionOptions = {
  station: Station | null;
  playback: PlaybackState;
  actions: MediaSessionActions;
  /** Builds the platform metadata object (e.g. `new MediaMetadata(...)`). */
  createMetadata?: (metadata: MediaMetadataLike) => unknown;
};

export function toMediaMetadata(station: Station | null): MediaMetadataLike | null {
  if (!station) return null;
  const region = station.country ?? station.countryCode ?? "Unknown region";
  return {
    title: station.name || "Untitled station",
    artist: region,
    album: station.genres.length ? station.genres.join(" · ") : "Radio Atlas",
  };
}

export function toMediaSessionPlaybackState(
  status: PlaybackState["status"],
): "none" | "paused" | "playing" {
  if (status === "playing") return "playing";
  if (status === "paused") return "paused";
  return "none";
}

export function syncMediaSession(
  mediaSession: MediaSessionLike | null | undefined,
  options: SyncMediaSessionOptions,
): void {
  if (!mediaSession) return;

  const metadata = toMediaMetadata(options.station);
  mediaSession.metadata = metadata
    ? (options.createMetadata?.(metadata) ?? metadata)
    : null;
  mediaSession.playbackState = toMediaSessionPlaybackState(options.playback.status);

  mediaSession.setActionHandler("play", options.actions.play);
  mediaSession.setActionHandler("pause", options.actions.pause);
  mediaSession.setActionHandler("stop", options.actions.stop);
}

export function getMediaSession(): MediaSessionLike | null {
  if (typeof navigator === "undefined") return null;
  const session = (navigator as unknown as { mediaSession?: MediaSessionLike }).mediaSession;
  return session ?? null;
}

export function createMetadata(): ((metadata: MediaMetadataLike) => unknown) | undefined {
  if (typeof MediaMetadata === "undefined") return undefined;
  return (metadata) => new MediaMetadata(metadata);
}
