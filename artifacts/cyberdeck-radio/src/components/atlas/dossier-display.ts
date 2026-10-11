/**
 * Maps the controller's PlaybackState to what the dossier card should show.
 *
 *   PlaybackState ──▶ toDossierDisplay ──▶ { statusLabel, statusTone, isTuning, playingStationName }
 *
 * Pure and unit-tested so the dossier's visuals always track real controller
 * state instead of guessing from button clicks.
 */

import type { PlaybackState } from "@/audio/audio-controller";

export type DossierDisplay = {
  statusLabel: string;
  statusTone: "idle" | "active" | "error";
  isTuning: boolean;
  isSwitching: boolean;
  playingStationName: string | null;
};

const UNTITLED = "UNTITLED STATION";

export function toDossierDisplay(state: PlaybackState): DossierDisplay {
  switch (state.status) {
    case "loading":
      return {
        statusLabel: state.switching ? "SWITCHING" : "TUNING",
        statusTone: "active",
        isTuning: true,
        isSwitching: Boolean(state.switching),
        playingStationName: state.station.name || UNTITLED,
      };
    case "playing":
      return {
        statusLabel: "ON AIR",
        statusTone: "active",
        isTuning: true,
        isSwitching: false,
        playingStationName: state.station.name || UNTITLED,
      };
    case "paused":
      return {
        statusLabel: "PAUSED",
        statusTone: "idle",
        isTuning: false,
        isSwitching: false,
        playingStationName: state.station.name || UNTITLED,
      };
    case "error":
      return {
        statusLabel: "SIGNAL LOST",
        statusTone: "error",
        isTuning: false,
        isSwitching: false,
        playingStationName: state.station.name || UNTITLED,
      };
    case "idle":
      return {
        statusLabel: "STANDBY",
        statusTone: "idle",
        isTuning: false,
        isSwitching: false,
        playingStationName: null,
      };
  }
}