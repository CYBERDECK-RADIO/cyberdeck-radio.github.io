import { describe, expect, it } from "vitest";

import type { PlaybackState } from "@/audio/audio-controller";
import type Station from "@/stations/types";
import { describeStageCaption, type CaptionSegment } from "./stage-caption";

function station(id: string, name = "Night Drive FM"): Station {
  return {
    id,
    name,
    country: "Japan",
    countryCode: "JP",
    genres: [],
    streams: [{ url: "https://secure.example/live" }],
  };
}

function text(segments: CaptionSegment[]): string {
  return segments.map((segment) => segment.text).join("");
}

function caption(playback: PlaybackState, overrides: Partial<Parameters<typeof describeStageCaption>[0]> = {}) {
  return describeStageCaption({
    playback,
    selectedStation: null,
    submittedQuery: "",
    visibleCount: 0,
    ...overrides,
  });
}

describe("describeStageCaption", () => {
  it("describes a playing station with its location", () => {
    const target = station("playing");
    expect(text(caption({ status: "playing", station: target, streamIndex: 0 }))).toBe(
      "On air — Night Drive FM in Japan · JP.",
    );
  });

  it("marks the station name as emphasis", () => {
    const target = station("emphasis");
    const segments = caption({ status: "playing", station: target, streamIndex: 0 });
    expect(segments.find((segment) => segment.strong)?.text).toBe("Night Drive FM");
  });

  it("describes a plain tune", () => {
    const target = station("tuning");
    expect(text(caption({ status: "loading", station: target, streamIndex: 0 }))).toBe(
      "Tuning Night Drive FM…",
    );
  });

  it("describes a graceful station switch", () => {
    const target = station("switching");
    expect(
      text(caption({ status: "loading", station: target, streamIndex: 0, switching: true })),
    ).toBe("Switching to Night Drive FM — locking the new signal.");
  });

  it("describes a paused station", () => {
    const target = station("paused");
    expect(text(caption({ status: "paused", station: target, streamIndex: 0 }))).toBe(
      "Paused. Press play to resume Night Drive FM.",
    );
  });

  it("describes an error and invites a retry", () => {
    const target = station("error");
    expect(text(caption({ status: "error", station: target, message: "boom" }))).toBe(
      "No signal from Night Drive FM. Press play to try again.",
    );
  });

  it("prompts for a tap on the idle dial", () => {
    expect(text(caption({ status: "idle" }))).toBe(
      "Tap any channel to tune in — playback starts instantly.",
    );
  });

  it("describes the matching results for a query", () => {
    expect(
      text(caption({ status: "idle" }, { submittedQuery: "jazz", visibleCount: 4 })),
    ).toBe("Tap one of the 4 matching signals to play it.");
  });

  it("uses the singular for one match", () => {
    expect(
      text(caption({ status: "idle" }, { submittedQuery: "jazz", visibleCount: 1 })),
    ).toBe("Tap one of the 1 matching signal to play it.");
  });

  it("handles an empty result set", () => {
    expect(
      text(caption({ status: "idle" }, { submittedQuery: "nope", visibleCount: 0 })),
    ).toBe("No signals here. Try a different search or source.");
  });

  it("describes a locked but idle selection", () => {
    const target = station("locked");
    expect(text(caption({ status: "idle" }, { selectedStation: target }))).toBe(
      "Locked on Night Drive FM — press play to listen.",
    );
  });

  it("falls back for an unnamed station", () => {
    const target = station("unnamed", "");
    expect(text(caption({ status: "playing", station: target, streamIndex: 0 }))).toContain(
      "an untitled station",
    );
  });
});