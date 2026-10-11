/**
 * One station-playing state machine over a single HTML audio element.
 *
 *   play(station)                     media "playing"        media "error"
 *   idle ──▶ loading(idx 0) ──▶ playing ────────────────▶ (advance idx / error)
 *              ▲  │                 │  pause()                    │
 *              │  │ media error     ▼                            │ exhausted
 *              │  └── advance idx  paused ──play(same station)─▶ playing
 *              └──── play(station) (retry from error)
 *   stop()/dispose() ──▶ idle, listeners detached
 *
 *   inputs:  Station.streams[], injected MediaElementLike, setVolume
 *   outputs: PlaybackState snapshot + change notifications via subscribe()
 *
 * HTTPS-only filtering and the one-pass fallback live here so callers never
 * touch media elements, autoplay policy, or stream ordering.
 */

import type Station from "../stations/types";

export type PlaybackState =
  | { status: "idle" }
  | { status: "loading"; station: Station; streamIndex: number; switching?: boolean }
  | { status: "playing"; station: Station; streamIndex: number }
  | { status: "paused"; station: Station; streamIndex: number }
  | { status: "error"; station: Station; message: string };

export type MediaElementLike = {
  src: string;
  volume: number;
  play(): Promise<void>;
  pause(): void;
  load(): void;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
};

/**
 * A live spectrum tap on the playing element. The controller only asks the
 * factory once, on the first confirmed "playing" event, so the analyser can be
 * built against a media element that already has audio flowing.
 */
export type AnalyserLike = {
  getLevels(bars: number): number[];
  resume?(): void;
  dispose?(): void;
};

export type AudioControllerOptions = {
  /** Media element factory; defaults to a fresh HTMLAudioElement in the browser. */
  createMedia?: () => MediaElementLike;
  /** When true, only https: stream URLs are attempted. Defaults to true on an HTTPS page. */
  requireHttps?: boolean;
  /**
   * Optional analyser factory. Returns null when the browser or stream cannot
   * safely be tapped, in which case the visualizer stays simulated.
   */
  createAnalyser?: (media: MediaElementLike) => AnalyserLike | null;
};

export interface AudioController {
  getState(): PlaybackState;
  subscribe(listener: (state: PlaybackState) => void): () => void;
  play(station: Station): Promise<void>;
  pause(): void;
  stop(): void;
  setVolume(value: number): void;
  /** The live analyser, once playback has started and a tap succeeded. */
  getAnalyser(): AnalyserLike | null;
  dispose(): void;
}

const NO_CANDIDATE_MESSAGE =
  "No secure stream is available for this station.";
const EXHAUSTED_MESSAGE = "Every stream for this station failed.";
const AUTOPLAY_MESSAGE =
  "Playback needs a direct interaction. Press play to try again.";
const GENERIC_FAILURE_MESSAGE =
  "This station could not be played. Try another station.";

function defaultCreateMedia(): MediaElementLike {
  return new Audio() as unknown as MediaElementLike;
}

function defaultRequireHttps(): boolean {
  return typeof location !== "undefined" && location.protocol === "https:";
}

function isAttemptableUrl(url: string, requireHttps: boolean): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:") return true;
    return !requireHttps && parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function describePlayError(error: unknown): string {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return AUTOPLAY_MESSAGE;
  }
  return GENERIC_FAILURE_MESSAGE;
}

export function createAudioController(
  options: AudioControllerOptions = {},
): AudioController {
  const media = (options.createMedia ?? defaultCreateMedia)();
  const requireHttps = options.requireHttps ?? defaultRequireHttps();

  const listeners = new Set<(state: PlaybackState) => void>();
  let state: PlaybackState = { status: "idle" };
  let attemptToken = 0;
  let detachMediaListeners: (() => void) | null = null;
  let disposed = false;
  let analyser: AnalyserLike | null = null;
  let analyserRequested = false;

  function notify(next: PlaybackState): void {
    state = next;
    for (const listener of listeners) listener(state);
  }

  function detach(): void {
    detachMediaListeners?.();
    detachMediaListeners = null;
  }

  // Builds the analyser exactly once, on the first confirmed playback, so the
  // media element already has audio. Failures are swallowed: no tap, no analyser.
  function ensureAnalyser(): void {
    if (analyserRequested) return;
    analyserRequested = true;
    if (!options.createAnalyser) return;
    try {
      analyser = options.createAnalyser(media) ?? null;
    } catch {
      analyser = null;
    }
    analyser?.resume?.();
  }

  // Starts one candidate attempt. Resolves when play() settles so autoplay
  // rejection is observable; stream failures arrive later via the error event.
  function beginAttempt(
    station: Station,
    urls: string[],
    index: number,
    switching = false,
  ): Promise<void> {
    detach();
    const token = ++attemptToken;

    const handlePlaying = () => {
      if (token !== attemptToken) return;
      ensureAnalyser();
      notify({ status: "playing", station, streamIndex: index });
    };
    const handleError = () => {
      if (token !== attemptToken) return;
      if (index + 1 < urls.length) {
        void beginAttempt(station, urls, index + 1, switching);
        return;
      }
      detach();
      notify({ status: "error", station, message: EXHAUSTED_MESSAGE });
    };

    media.addEventListener("playing", handlePlaying);
    media.addEventListener("error", handleError);
    detachMediaListeners = () => {
      media.removeEventListener("playing", handlePlaying);
      media.removeEventListener("error", handleError);
    };

    notify(
      switching
        ? { status: "loading", station, streamIndex: index, switching: true }
        : { status: "loading", station, streamIndex: index },
    );
    media.src = urls[index];
    media.load();

    return Promise.resolve(media.play()).catch((error: unknown) => {
      if (token !== attemptToken) return;
      detach();
      notify({ status: "error", station, message: describePlayError(error) });
    });
  }

  async function play(station: Station): Promise<void> {
    if (disposed) return;

    if (state.status === "paused" && state.station.id === station.id) {
      const token = attemptToken;
      analyser?.resume?.();
      try {
        await media.play();
      } catch (error) {
        if (token !== attemptToken) return;
        detach();
        notify({ status: "error", station, message: describePlayError(error) });
      }
      return;
    }

    const urls = station.streams
      .map((stream) => stream.url)
      .filter((url) => isAttemptableUrl(url, requireHttps));

    if (urls.length === 0) {
      notify({ status: "error", station, message: NO_CANDIDATE_MESSAGE });
      return;
    }

    // Migrating from one station to another mid-playback is surfaced so the deck
    // can label the transition instead of flashing the plain "TUNING" state.
    const switching =
      state.status !== "idle" && state.station.id !== station.id;

    await beginAttempt(station, urls, 0, switching);
  }

  return {
    getState: () => state,

    subscribe(listener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    play,

    pause(): void {
      if (state.status === "loading" || state.status === "playing") {
        media.pause();
        notify({
          status: "paused",
          station: state.station,
          streamIndex: state.streamIndex,
        });
      }
    },

    stop(): void {
      attemptToken += 1;
      detach();
      media.pause();
      media.src = "";
      notify({ status: "idle" });
    },

    setVolume(value: number): void {
      if (!Number.isFinite(value)) return;
      media.volume = Math.min(1, Math.max(0, value));
    },

    getAnalyser(): AnalyserLike | null {
      return analyser;
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      attemptToken += 1;
      detach();
      media.pause();
      media.src = "";
      try {
        analyser?.dispose?.();
      } catch {
        // Best-effort teardown; a closed context must never block disposal.
      }
      analyser = null;
      listeners.clear();
      state = { status: "idle" };
    },
  };
}
