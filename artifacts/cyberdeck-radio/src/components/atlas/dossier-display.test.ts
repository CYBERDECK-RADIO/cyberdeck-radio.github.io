import { describe, expect, it } from "vitest";

import type { PlaybackState } from "@/audio/audio-controller";
import type Station from "@/stations/types";
import { toDossierDisplay } from "./dossier-display";

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

describe("toDossierDisplay", () => {
  it("maps idle to standby", () => {
    expect(toDossierDisplay(state({ status: "idle" }))).toEqual({
      statusLabel: "STANDBY",
      statusTone: "idle",
      isTuning: false,
      isSwitching: false,
      playingStationName: null,
    });
  });

  it("maps loading to tuning", () => {
    const target = station("loading");

    expect(toDossierDisplay(state({ status: "loading", station: target, streamIndex: 0 }))).toEqual({
      statusLabel: "TUNING",
      statusTone: "active",
      isTuning: true,
      isSwitching: false,
      playingStationName: "Night Drive FM",
    });
  });

  it("maps playing to on air", () => {
    const target = station("playing");

    expect(toDossierDisplay(state({ status: "playing", station: target, streamIndex: 0 }))).toEqual({
      statusLabel: "ON AIR",
      statusTone: "active",
      isTuning: true,
      isSwitching: false,
      playingStationName: "Night Drive FM",
    });
  });

  it("maps paused to paused", () => {
    const target = station("paused");

    expect(toDossierDisplay(state({ status: "paused", station: target, streamIndex: 0 }))).toEqual({
      statusLabel: "PAUSED",
      statusTone: "idle",
      isTuning: false,
      isSwitching: false,
      playingStationName: "Night Drive FM",
    });
  });

  it("maps error to signal lost", () => {
    const target = station("error");

    expect(
      toDossierDisplay(state({ status: "error", station: target, message: "boom" })),
    ).toEqual({
      statusLabel: "SIGNAL LOST",
      statusTone: "error",
      isTuning: false,
      isSwitching: false,
      playingStationName: "Night Drive FM",
    });
  });

  it("labels a station migration as switching", () => {
    const target = station("switching");

    expect(
      toDossierDisplay(state({ status: "loading", station: target, streamIndex: 0, switching: true })),
    ).toEqual({
      statusLabel: "SWITCHING",
      statusTone: "active",
      isTuning: true,
      isSwitching: true,
      playingStationName: "Night Drive FM",
    });
  });

  it("falls back to a stable label for an unnamed station", () => {
    const target = { ...station("unnamed"), name: "" };

    expect(
      toDossierDisplay(state({ status: "playing", station: target, streamIndex: 0 }))
        .playingStationName,
    ).toBe("UNTITLED STATION");
  });
});