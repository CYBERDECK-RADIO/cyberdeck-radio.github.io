// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import type { PlaybackState } from "@/audio/audio-controller";
import type Station from "@/stations/types";
import Deck from "./Deck";

afterEach(cleanup);

function station(id: string): Station {
  return {
    id,
    name: "Night Drive FM",
    country: "Japan",
    countryCode: "JP",
    genres: ["synthwave"],
    streams: [{ url: "https://secure.example/live", codec: "MP3", bitrate: 192 }],
  };
}

function renderDeck(playback: PlaybackState, stationValue: Station | null = station("s1")) {
  const onTogglePlayback = vi.fn();
  const onStop = vi.fn();
  const onVolumeChange = vi.fn();
  const view = render(
    <Deck
      station={stationValue}
      playback={playback}
      volume={0.6}
      onTogglePlayback={onTogglePlayback}
      onStop={onStop}
      onVolumeChange={onVolumeChange}
    />,
  );
  return { onTogglePlayback, onStop, onVolumeChange, view };
}

describe("Deck", () => {
  it("shows standby and a disabled stop button when idle", () => {
    renderDeck({ status: "idle" });

    expect(screen.getByTestId("deck-status").textContent).toBe("STANDBY");
    expect(screen.getByTestId("deck-play-button").getAttribute("aria-label")).toBe("Play station");
    expect((screen.getByTestId("deck-stop-button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows the selected station name and stream metadata", () => {
    renderDeck({ status: "idle" });

    expect(screen.getByTestId("deck-station-name").textContent).toBe("Night Drive FM");
    expect(screen.getByTestId("deck-meta").textContent).toContain("MP3");
    expect(screen.getByTestId("deck-meta").textContent).toContain("192 KBPS");
  });

  it("shows tuning while loading and a pause affordance", () => {
    const target = station("s1");
    renderDeck({ status: "loading", station: target, streamIndex: 0 });

    expect(screen.getByTestId("deck-status").textContent).toBe("TUNING");
    expect(screen.getByTestId("deck-play-button").getAttribute("aria-label")).toBe("Pause station");
    expect((screen.getByTestId("deck-stop-button") as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows on air while playing", () => {
    const target = station("s1");
    renderDeck({ status: "playing", station: target, streamIndex: 0 });

    expect(screen.getByTestId("deck-status").textContent).toBe("ON AIR");
  });

  it("shows paused and a play affordance to resume", () => {
    const target = station("s1");
    renderDeck({ status: "paused", station: target, streamIndex: 0 });

    expect(screen.getByTestId("deck-status").textContent).toBe("PAUSED");
    expect(screen.getByTestId("deck-play-button").getAttribute("aria-label")).toBe("Play station");
  });

  it("shows signal lost with the error message", () => {
    const target = station("s1");
    renderDeck({ status: "error", station: target, message: "Every stream for this station failed." });

    expect(screen.getByTestId("deck-status").textContent).toBe("SIGNAL LOST");
    expect(screen.getByTestId("deck-error").textContent).toContain("Every stream for this station failed.");
  });

  it("labels the visualizer as simulated", () => {
    renderDeck({ status: "idle" });

    expect(screen.getByTestId("deck-visualizer-mode").textContent).toBe("SIMULATED");
  });

  it("hides the style toggle when no handler is provided", () => {
    renderDeck({ status: "idle" });

    expect(screen.queryByTestId("deck-visualizer-style")).toBeNull();
  });

  it("shows the active style and cycles it through the callback", () => {
    const onCycleVisualizerStyle = vi.fn();
    render(
      <Deck
        station={station("s1")}
        playback={{ status: "idle" }}
        volume={0.6}
        onTogglePlayback={vi.fn()}
        onStop={vi.fn()}
        onVolumeChange={vi.fn()}
        visualizerStyle="spectrum"
        onCycleVisualizerStyle={onCycleVisualizerStyle}
      />,
    );

    const toggle = screen.getByTestId("deck-visualizer-style");
    expect(toggle.textContent).toBe("SPECTRUM");
    toggle.click();
    expect(onCycleVisualizerStyle).toHaveBeenCalledTimes(1);
  });

  it("shows VU when that style is active", () => {
    render(
      <Deck
        station={station("s1")}
        playback={{ status: "idle" }}
        volume={0.6}
        onTogglePlayback={vi.fn()}
        onStop={vi.fn()}
        onVolumeChange={vi.fn()}
        visualizerStyle="vu"
        onCycleVisualizerStyle={vi.fn()}
      />,
    );

    expect(screen.getByTestId("deck-visualizer-style").textContent).toBe("VU");
  });

  it("reflects the volume slider value", () => {
    renderDeck({ status: "idle" });

    expect((screen.getByTestId("deck-volume") as HTMLInputElement).value).toBe("0.6");
  });

  it("shows a placeholder when no station is locked", () => {
    renderDeck({ status: "idle" }, null);

    expect(screen.getByTestId("deck-station-name").textContent).toBe("NO STATION LOCKED");
    expect((screen.getByTestId("deck-play-button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("forwards transport actions to the callbacks", () => {
    const target = station("s1");
    const { onTogglePlayback, onStop } = renderDeck({
      status: "playing",
      station: target,
      streamIndex: 0,
    });

    screen.getByTestId("deck-play-button").click();
    expect(onTogglePlayback).toHaveBeenCalledTimes(1);

    screen.getByTestId("deck-stop-button").click();
    expect(onStop).toHaveBeenCalledTimes(1);
  });
});