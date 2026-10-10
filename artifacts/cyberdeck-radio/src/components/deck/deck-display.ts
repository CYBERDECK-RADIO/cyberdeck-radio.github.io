/**
 * Maps the controller's PlaybackState to what the deck should show.
 *
 *   PlaybackState ──▶ toDeckDisplay ──▶ { statusLabel, statusTone, isTuning, playingStationName }
 *
 * Pure and unit-tested so the deck's visuals always track real controller
 * state instead of guessing from button clicks.
 */

import type { PlaybackState } from "@/audio/audio-controller";

export type DeckDisplay = {
  statusLabel: string;
  statusTone: "idle" | "active" | "error";
  isTuning: boolean;
  playingStationName: string | null;
};

const UNTITLED = "UNTITLED STATION";

export function toDeckDisplay(state: PlaybackState): DeckDisplay {
  switch (state.status) {
    case "loading":
      return {
        statusLabel: "TUNING",
        statusTone: "active",
        isTuning: true,
        playingStationName: state.station.name || UNTITLED,
      };
    case "playing":
      return {
        statusLabel: "ON AIR",
        statusTone: "active",
        isTuning: true,
        playingStationName: state.station.name || UNTITLED,
      };
    case "paused":
      return {
        statusLabel: "PAUSED",
        statusTone: "idle",
        isTuning: false,
        playingStationName: state.station.name || UNTITLED,
      };
    case "error":
      return {
        statusLabel: "SIGNAL LOST",
        statusTone: "error",
        isTuning: false,
        playingStationName: state.station.name || UNTITLED,
      };
    case "idle":
      return {
        statusLabel: "STANDBY",
        statusTone: "idle",
        isTuning: false,
        playingStationName: null,
      };
  }
}