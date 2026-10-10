import { describe, expect, it } from "vitest";

import type { PlaybackState } from "@/audio/audio-controller";
import type Station from "@/stations/types";
import { toDeckDisplay } from "./deck-display";

function station(id: string): Station {
  return {
    id,
    name: "Night Drive FM",
    genres: [],
    streams: [{ url: "https://secure.example/live" }],
  };
}

function state(overrides: PlaybackState): PlaybackState {
  return overrides;
}

describe("toDeckDisplay", () => {
  it("maps idle to standby", () => {
    expect(toDeckDisplay(state({ status: "idle" }))).toEqual({
      statusLabel: "STANDBY",
      statusTone: "idle",
      isTuning: false,
      playingStationName: null,
    });
  });

  it("maps loading to tuning", () => {
    const target = station("loading");

    expect(toDeckDisplay(state({ status: "loading", station: target, streamIndex: 0 }))).toEqual({
      statusLabel: "TUNING",
      statusTone: "active",
      isTuning: true,
      playingStationName: "Night Drive FM",
    });
  });

  it("maps playing to on air", () => {
    const target = station("playing");

    expect(toDeckDisplay(state({ status: "playing", station: target, streamIndex: 0 }))).toEqual({
      statusLabel: "ON AIR",
      statusTone: "active",
      isTuning: true,
      playingStationName: "Night Drive FM",
    });
  });

  it("maps paused to paused", () => {
    const target = station("paused");

    expect(toDeckDisplay(state({ status: "paused", station: target, streamIndex: 0 }))).toEqual({
      statusLabel: "PAUSED",
      statusTone: "idle",
      isTuning: false,
      playingStationName: "Night Drive FM",
    });
  });

  it("maps error to signal lost", () => {
    const target = station("error");

    expect(
      toDeckDisplay(state({ status: "error", station: target, message: "boom" })),
    ).toEqual({
      statusLabel: "SIGNAL LOST",
      statusTone: "error",
      isTuning: false,
      playingStationName: "Night Drive FM",
    });
  });

  it("falls back to a stable label for an unnamed station", () => {
    const target = { ...station("unnamed"), name: "" };

    expect(
      toDeckDisplay(state({ status: "playing", station: target, streamIndex: 0 }))
        .playingStationName,
    ).toBe("UNTITLED STATION");
  });
});