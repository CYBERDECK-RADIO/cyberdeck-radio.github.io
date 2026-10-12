// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PlaybackState } from "@/audio/audio-controller";
import { SCREENSAVER_CONTROL_ATTR } from "@/modes/screensaver";
import type Station from "@/stations/types";
import ScreensaverOverlay from "./ScreensaverOverlay";

function station(id = "night-wave"): Station {
  return {
    id,
    name: "Night Wave",
    country: "Japan",
    countryCode: "JP",
    genres: ["ambient"],
    streams: [{ url: "https://secure.example/live", codec: "mp3", bitrate: 128 }],
  };
}

const idle: PlaybackState = { status: "idle" };

afterEach(cleanup);

describe("ScreensaverOverlay", () => {
  it("stands by with no carrier locked", () => {
    render(
      <ScreensaverOverlay
        station={null}
        playback={idle}
        onTogglePlayback={() => {}}
        onWake={() => {}}
      />,
    );

    expect(screen.getByTestId("screensaver-station-name").textContent).toBe(
      "No station locked",
    );
    expect(screen.getByTestId("screensaver-carrier").textContent).toBe("No carrier locked");
    expect(screen.getByTestId("screensaver-play").hasAttribute("disabled")).toBe(true);

    const clock = screen.getByTestId("screensaver-clock");
    expect(clock.querySelector("svg")).not.toBeNull();
    expect(clock.querySelector(".analogue-clock__hand")).not.toBeNull();
    expect(clock.querySelector("time")?.textContent).toMatch(/\d{2}:\d{2}:\d{2}/);
    expect(clock.textContent).not.toContain("UTC");
  });

  it("shows the tuned station with its synthetic carrier and status", () => {
    const target = station();
    render(
      <ScreensaverOverlay
        station={target}
        playback={{ status: "playing", station: target, streamIndex: 0 }}
        health="live"
        onTogglePlayback={() => {}}
        onWake={() => {}}
      />,
    );

    expect(screen.getByTestId("screensaver-station-name").textContent).toBe("Night Wave");
    expect(screen.getByTestId("screensaver-carrier").textContent).toContain("MHz");
    expect(screen.getByTestId("screensaver-carrier").textContent).toContain("Japan · JP");
    expect(screen.getByTestId("screensaver-play").getAttribute("aria-label")).toBe(
      "Pause station",
    );
    expect(screen.getByTestId("screensaver-play").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Live")).toBeTruthy();
  });

  it("keeps its own transport exempt from waking the saver", () => {
    const onTogglePlayback = vi.fn();
    render(
      <ScreensaverOverlay
        station={station()}
        playback={idle}
        onTogglePlayback={onTogglePlayback}
        onWake={() => {}}
      />,
    );

    const play = screen.getByTestId("screensaver-play");
    expect(play.hasAttribute(SCREENSAVER_CONTROL_ATTR)).toBe(true);

    fireEvent.click(play);
    expect(onTogglePlayback).toHaveBeenCalledTimes(1);
  });

  it("wakes the atlas from its wake control", () => {
    const onWake = vi.fn();
    render(
      <ScreensaverOverlay
        station={station()}
        playback={idle}
        onTogglePlayback={() => {}}
        onWake={onWake}
      />,
    );

    fireEvent.click(screen.getByTestId("button-wake-screensaver"));
    expect(onWake).toHaveBeenCalledTimes(1);
  });
});
