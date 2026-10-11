import { describe, expect, it, vi } from "vitest";

import type Station from "../stations/types";
import {
  createAudioController,
  type AudioController,
  type MediaElementLike,
  type PlaybackState,
} from "./audio-controller";

class FakeMedia implements MediaElementLike {
  src = "";
  volume = 1;
  playCalls = 0;
  pauseCalls = 0;
  loadCalls = 0;
  playImpl: () => Promise<void> = () => Promise.resolve();

  private handlers = new Map<string, Set<() => void>>();

  play(): Promise<void> {
    this.playCalls += 1;
    return this.playImpl();
  }

  pause(): void {
    this.pauseCalls += 1;
  }

  load(): void {
    this.loadCalls += 1;
  }

  addEventListener(type: string, listener: () => void): void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.handlers.get(type)?.delete(listener);
  }

  /** Snapshot the currently registered listeners for a type. */
  listeners(type: string): Array<() => void> {
    return Array.from(this.handlers.get(type) ?? []);
  }

  /** Fire an event at the currently registered listeners. */
  emit(type: string): void {
    for (const listener of this.listeners(type)) listener();
  }
}

function station(id: string, urls: string[]): Station {
  return {
    id,
    name: id,
    genres: [],
    streams: urls.map((url) => ({ url })),
  };
}

function makeController(media: FakeMedia, requireHttps = true) {
  const controller = createAudioController({
    createMedia: () => media,
    requireHttps,
  });
  const states: PlaybackState[] = [];
  controller.subscribe((state) => states.push(state));
  return { controller, states };
}

describe("createAudioController", () => {
  it("starts idle and emits nothing until play is called", () => {
    const media = new FakeMedia();
    const { controller, states } = makeController(media);

    expect(controller.getState()).toEqual({ status: "idle" });
    expect(states).toEqual([]);
  });

  it("attempts only HTTPS candidates when the page requires HTTPS", async () => {
    const media = new FakeMedia();
    const { controller } = makeController(media, true);
    const target = station("mix", [
      "http://insecure.example/live",
      "https://secure.example/live",
    ]);

    await controller.play(target);

    expect(media.src).toBe("https://secure.example/live");
    expect(media.playCalls).toBe(1);
  });

  it("attempts HTTP candidates when HTTPS is not required", async () => {
    const media = new FakeMedia();
    const { controller } = makeController(media, false);

    await controller.play(station("plain", ["http://insecure.example/live"]));

    expect(media.src).toBe("http://insecure.example/live");
    expect(media.playCalls).toBe(1);
  });

  it("emits loading before playback resolves and playing only after media confirms", async () => {
    const media = new FakeMedia();
    media.playImpl = () => new Promise<void>(() => {});
    const { controller, states } = makeController(media);
    const target = station("slow", ["https://secure.example/live"]);

    const pending = controller.play(target);

    expect(controller.getState()).toEqual({
      status: "loading",
      station: target,
      streamIndex: 0,
    });

    media.emit("playing");

    expect(controller.getState()).toEqual({
      status: "playing",
      station: target,
      streamIndex: 0,
    });
    expect(states.map((state) => state.status)).toEqual(["loading", "playing"]);

    void pending;
  });

  it("skips unparseable stream URLs entirely", async () => {
    const media = new FakeMedia();
    const { controller } = makeController(media);

    await controller.play(station("bad", ["not-a-url"]));

    expect(controller.getState().status).toBe("error");
    expect(media.playCalls).toBe(0);
  });

  it("reports an error and attempts no playback when no candidate qualifies", async () => {
    const media = new FakeMedia();
    const { controller } = makeController(media, true);

    await controller.play(station("insecure-only", ["http://insecure.example/live"]));

    expect(controller.getState().status).toBe("error");
    expect(media.playCalls).toBe(0);
  });

  it("turns a rejected play() into a recoverable error and allows a retry", async () => {
    const media = new FakeMedia();
    media.playImpl = () =>
      Promise.reject(new DOMException("blocked", "NotAllowedError"));
    const { controller } = makeController(media);
    const target = station("gated", ["https://secure.example/live"]);

    await controller.play(target);

    expect(controller.getState().status).toBe("error");

    media.playImpl = () => Promise.resolve();
    await controller.play(target);
    expect(controller.getState().status).toBe("loading");

    media.emit("playing");
    expect(controller.getState().status).toBe("playing");
  });

  it("falls back once to a later candidate, then plays it", async () => {
    const media = new FakeMedia();
    const { controller } = makeController(media);
    const target = station("backup", [
      "https://primary.example/live",
      "https://backup.example/live",
    ]);

    await controller.play(target);
    expect(controller.getState()).toEqual({
      status: "loading",
      station: target,
      streamIndex: 0,
    });

    media.emit("error");

    expect(controller.getState()).toEqual({
      status: "loading",
      station: target,
      streamIndex: 1,
    });
    expect(media.src).toBe("https://backup.example/live");

    media.emit("playing");
    expect(controller.getState()).toEqual({
      status: "playing",
      station: target,
      streamIndex: 1,
    });
  });

  it("emits one stable error after all candidates fail and never retries", async () => {
    const media = new FakeMedia();
    const { controller, states } = makeController(media);

    await controller.play(station("dead", ["https://secure.example/live"]));
    media.emit("error");

    expect(controller.getState().status).toBe("error");
    expect(media.playCalls).toBe(1);

    media.emit("error");
    expect(controller.getState().status).toBe("error");
    expect(media.playCalls).toBe(1);
    expect(states.filter((state) => state.status === "error")).toHaveLength(1);
  });

  it("ignores stale events after switching stations", async () => {
    const media = new FakeMedia();
    const { controller } = makeController(media);
    const first = station("first", ["https://first.example/live"]);
    const second = station("second", ["https://second.example/live"]);

    const staleListeners: Array<() => void> = [];
    await controller.play(first);
    staleListeners.push(...media.listeners("playing"), ...media.listeners("error"));

    await controller.play(second);
    expect(controller.getState()).toEqual({
      status: "loading",
      station: second,
      streamIndex: 0,
      switching: true,
    });

    for (const listener of staleListeners) listener();

    expect(controller.getState()).toEqual({
      status: "loading",
      station: second,
      streamIndex: 0,
      switching: true,
    });

    media.emit("playing");
    expect(controller.getState()).toEqual({
      status: "playing",
      station: second,
      streamIndex: 0,
    });
  });

  it("flags a station migration as switching while a different station plays", async () => {
    const media = new FakeMedia();
    const { controller, states } = makeController(media);
    const first = station("first", ["https://first.example/live"]);
    const second = station("second", ["https://second.example/live"]);

    await controller.play(first);
    media.emit("playing");

    await controller.play(second);

    expect(controller.getState()).toEqual({
      status: "loading",
      station: second,
      streamIndex: 0,
      switching: true,
    });
    expect(states.at(-1)).toMatchObject({ status: "loading", switching: true });
  });

  it("does not flag a fresh play from idle as switching", async () => {
    const media = new FakeMedia();
    const { controller } = makeController(media);
    const target = station("cold", ["https://cold.example/live"]);

    await controller.play(target);

    expect(controller.getState()).toEqual({
      status: "loading",
      station: target,
      streamIndex: 0,
    });
  });

  it("builds the analyser once on first playback and disposes it", async () => {
    const media = new FakeMedia();
    let created = 0;
    let disposed = 0;
    const analyser = {
      getLevels: (bars: number) => new Array(bars).fill(0),
      dispose: () => {
        disposed += 1;
      },
    };
    const controller = createAudioController({
      createMedia: () => media,
      requireHttps: true,
      createAnalyser: () => {
        created += 1;
        return analyser;
      },
    });

    expect(controller.getAnalyser()).toBeNull();

    await controller.play(station("tuned", ["https://tuned.example/live"]));
    media.emit("playing");
    expect(controller.getAnalyser()).toBe(analyser);

    await controller.play(station("next", ["https://next.example/live"]));
    media.emit("playing");
    expect(created).toBe(1);

    controller.dispose();
    expect(disposed).toBe(1);
  });

  it("pauses the active stream and resumes the same station without reloading", async () => {
    const media = new FakeMedia();
    const { controller } = makeController(media);
    const target = station("resume", ["https://secure.example/live"]);

    await controller.play(target);
    media.emit("playing");

    controller.pause();
    expect(controller.getState()).toEqual({
      status: "paused",
      station: target,
      streamIndex: 0,
    });
    expect(media.pauseCalls).toBe(1);

    const loadsBeforeResume = media.loadCalls;
    await controller.play(target);
    expect(media.loadCalls).toBe(loadsBeforeResume);

    media.emit("playing");
    expect(controller.getState()).toEqual({
      status: "playing",
      station: target,
      streamIndex: 0,
    });
  });

  it("stops playback back to idle and clears the source", async () => {
    const media = new FakeMedia();
    const { controller } = makeController(media);

    await controller.play(station("stop", ["https://secure.example/live"]));
    media.emit("playing");
    controller.stop();

    expect(controller.getState()).toEqual({ status: "idle" });
    expect(media.src).toBe("");
  });

  it("clamps volume to the 0..1 range and ignores non-finite values", () => {
    const media = new FakeMedia();
    const { controller } = makeController(media);

    controller.setVolume(0.4);
    expect(media.volume).toBeCloseTo(0.4);

    controller.setVolume(4);
    expect(media.volume).toBe(1);

    controller.setVolume(-3);
    expect(media.volume).toBe(0);

    controller.setVolume(Number.NaN);
    expect(media.volume).toBe(0);
  });

  it("stops delivering state to an unsubscribed listener", async () => {
    const media = new FakeMedia();
    const controller = createAudioController({
      createMedia: () => media,
      requireHttps: true,
    });
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);

    unsubscribe();
    await controller.play(station("quiet", ["https://secure.example/live"]));

    expect(listener).not.toHaveBeenCalled();
  });

  it("disposes media listeners so later events are ignored", async () => {
    const media = new FakeMedia();
    const { controller } = makeController(media);

    await controller.play(station("gone", ["https://secure.example/live"]));
    const playing = media.listeners("playing");
    controller.dispose();

    for (const listener of playing) listener();

    expect(media.listeners("playing")).toHaveLength(0);
    expect(controller.getState()).toEqual({ status: "idle" });
  });
});

// The controller must be usable as the app's single source of playback truth.
export type _AudioControllerContract = AudioController;
