/**
 * Stage caption: the one line under the player hero, always telling the truth
 * about what the controller is doing.
 *
 *   PlaybackState + selection + query ──▶ describeStageCaption ──▶ segments
 *
 * Pure and unit-tested so the copy can never drift from the interaction model
 * (pick-to-play, graceful switching, retry after an error).
 */

import type { PlaybackState } from "@/audio/audio-controller";
import { stationLocationLabel } from "@/stations/station-meta";
import type Station from "@/stations/types";

export type CaptionSegment = { text: string; strong?: boolean };

export type StageCaptionInput = {
  playback: PlaybackState;
  selectedStation: Station | null;
  submittedQuery: string;
  visibleCount: number;
};

function named(station: Station): string {
  return station.name || "an untitled station";
}

export function describeStageCaption({
  playback,
  selectedStation,
  submittedQuery,
  visibleCount,
}: StageCaptionInput): CaptionSegment[] {
  switch (playback.status) {
    case "loading":
      return playback.switching
        ? [
            { text: "Switching to " },
            { text: named(playback.station), strong: true },
            { text: " — locking the new signal." },
          ]
        : [{ text: "Tuning " }, { text: named(playback.station), strong: true }, { text: "…" }];
    case "playing":
      return [
        { text: "On air — " },
        { text: named(playback.station), strong: true },
        { text: ` in ${stationLocationLabel(playback.station)}.` },
      ];
    case "paused":
      return [
        { text: "Paused. Press play to resume " },
        { text: named(playback.station), strong: true },
        { text: "." },
      ];
    case "error":
      return [
        { text: "No signal from " },
        { text: named(playback.station), strong: true },
        { text: ". Press play to try again." },
      ];
  }

  if (selectedStation) {
    return [
      { text: "Locked on " },
      { text: named(selectedStation), strong: true },
      { text: " — press play to listen." },
    ];
  }

  if (submittedQuery === "") {
    return [{ text: "Tap any channel to tune in — playback starts instantly." }];
  }

  if (visibleCount === 0) {
    return [{ text: "No signals here. Try a different search or source." }];
  }

  return [
    { text: "Tap one of the " },
    { text: `${visibleCount} matching signal${visibleCount === 1 ? "" : "s"}`, strong: true },
    { text: " to play it." },
  ];
}