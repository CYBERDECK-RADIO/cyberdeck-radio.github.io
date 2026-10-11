// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import DossierCard from "./DossierCard";
import type { PlaybackState } from "@/audio/audio-controller";
import { formatFrequency, stationFrequency } from "@/stations/frequency";
import type Station from "@/stations/types";

const station: Station = {
  id: "alpha",
  name: "Alpha Wave",
  country: "France",
  countryCode: "FR",
  genres: ["world"],
  coordinates: [2.35, 48.85],
  streams: [{ url: "https://stream.example/alpha", codec: "mp3", bitrate: 128 }],
};

describe("DossierCard", () => {
  beforeEach(() => cleanup());

  const base = {
    volume: 0.7,
    onTogglePlayback: vi.fn(),
    onStop: vi.fn(),
    onVolumeChange: vi.fn(),
  };

  it("shows an honest standby state with no station", () => {
    render(
      <DossierCard
        {...base}
        station={null}
        playback={{ status: "idle" }}
      />,
    );

    expect(screen.getByTestId("deck-station-name").textContent).toBe("No station locked");
    expect(screen.getByTestId("deck-status").textContent).toBe("STANDBY");
    expect(screen.getByTestId("deck-play-button").hasAttribute("disabled")).toBe(true);
  });

  it("renders the locked station's identity, carrier, and health", () => {
    render(
      <DossierCard
        {...base}
        station={station}
        health="live"
        playback={{ status: "playing", station, streamIndex: 0 }}
        playing
      />,
    );

    expect(screen.getByTestId("deck-station-name").textContent).toBe("Alpha Wave");
    expect(screen.getByTestId("dossier-location").textContent).toContain("France");
    expect(screen.getByTestId("dossier-flag").textContent).toBe("🇫🇷");
    expect(screen.getByTestId("dossier-flag").getAttribute("aria-label")).toBe("France");
    expect(screen.getByTestId("dossier-frequency").textContent).toBe(
      `${formatFrequency(stationFrequency("alpha"))} MHz`,
    );
    expect(screen.getByTestId("deck-status").textContent).toBe("ON AIR");
    expect(screen.getByTestId("deck-health").textContent).toBe("Live");
    expect(screen.getByTestId("dossier-coordinates").textContent).toBe("48.85° N · 2.35° E");
    expect(screen.getByTestId("deck-meta").textContent).toContain("MP3 · 128 KBPS");
    expect(screen.getByTestId("level-meter")).toBeTruthy();
  });

  it("omits the country flag when the station has no country code", () => {
    const stationWithoutCode: Station = {
      ...station,
      country: undefined,
      countryCode: undefined,
    };
    render(
      <DossierCard
        {...base}
        station={stationWithoutCode}
        playback={{ status: "playing", station: stationWithoutCode, streamIndex: 0 }}
        playing
      />,
    );

    expect(screen.queryByTestId("dossier-flag")).toBeNull();
    expect(screen.getByTestId("dossier-location").textContent).toContain("Location not listed");
  });

  it("forwards transport and volume actions", () => {
    const onTogglePlayback = vi.fn();
    const onStop = vi.fn();
    const onVolumeChange = vi.fn();
    render(
      <DossierCard
        station={station}
        playback={{ status: "paused", station, streamIndex: 0 }}
        volume={0.4}
        onTogglePlayback={onTogglePlayback}
        onStop={onStop}
        onVolumeChange={onVolumeChange}
      />,
    );

    fireEvent.click(screen.getByTestId("deck-play-button"));
    expect(onTogglePlayback).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("deck-stop-button"));
    expect(onStop).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByTestId("deck-volume"), { target: { value: "0.2" } });
    expect(onVolumeChange).toHaveBeenCalledWith(0.2);
  });

  it("forwards channel-keeping actions and mirrors the pinned state", () => {
    const onTogglePin = vi.fn();
    const onShare = vi.fn();
    const { rerender } = render(
      <DossierCard
        {...base}
        station={station}
        playback={{ status: "playing", station, streamIndex: 0 }}
        playing
        onTogglePin={onTogglePin}
        onShare={onShare}
      />,
    );

    const pin = screen.getByTestId("deck-pin-button");
    expect(pin.getAttribute("aria-pressed")).toBe("false");
    expect(pin.getAttribute("aria-label")).toBe("Pin channel");
    fireEvent.click(pin);
    expect(onTogglePin).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("deck-share-button"));
    expect(onShare).toHaveBeenCalledTimes(1);

    rerender(
      <DossierCard
        {...base}
        station={station}
        playback={{ status: "playing", station, streamIndex: 0 }}
        playing
        pinned
        onTogglePin={onTogglePin}
        onShare={onShare}
      />,
    );
    expect(pin.getAttribute("aria-pressed")).toBe("true");
    expect(pin.getAttribute("aria-label")).toBe("Unpin channel");

    rerender(
      <DossierCard
        {...base}
        station={null}
        playback={{ status: "idle" }}
        onTogglePin={onTogglePin}
        onShare={onShare}
      />,
    );
    expect(screen.getByTestId("deck-pin-button").hasAttribute("disabled")).toBe(true);
  });

  it("hops to the previous and next channel in the result pool", () => {
    const onHop = vi.fn();
    render(
      <DossierCard
        {...base}
        station={station}
        playback={{ status: "playing", station, streamIndex: 0 }}
        playing
        canHop
        onHop={onHop}
      />,
    );

    const prev = screen.getByTestId("deck-prev-button");
    const next = screen.getByTestId("deck-next-button");
    expect(prev.getAttribute("aria-label")).toBe("Previous channel");
    expect(next.getAttribute("aria-label")).toBe("Next channel");

    fireEvent.click(prev);
    expect(onHop).toHaveBeenLastCalledWith(-1);

    fireEvent.click(next);
    expect(onHop).toHaveBeenLastCalledWith(1);

    fireEvent.keyDown(next, { key: "Enter" });
    expect(onHop).toHaveBeenLastCalledWith(1);
  });

  it("leaves the hop controls inert when there is nothing to hop to", () => {
    const onHop = vi.fn();
    render(
      <DossierCard
        {...base}
        station={station}
        playback={{ status: "playing", station, streamIndex: 0 }}
        playing
        onHop={onHop}
      />,
    );

    const prev = screen.getByTestId("deck-prev-button");
    const next = screen.getByTestId("deck-next-button");
    expect(prev.hasAttribute("disabled")).toBe(true);
    expect(next.hasAttribute("disabled")).toBe(true);

    fireEvent.click(prev);
    fireEvent.click(next);
    expect(onHop).not.toHaveBeenCalled();
  });

  it("surfaces a failed stream as an alert", () => {
    render(
      <DossierCard
        {...base}
        station={station}
        playback={{ status: "error", station, message: "Stream refused the handshake." }}
      />,
    );

    const alert = screen.getByTestId("deck-error");
    expect(alert.getAttribute("role")).toBe("alert");
    expect(alert.textContent).toContain("Stream refused the handshake.");
    expect(screen.getByTestId("deck-status").textContent).toBe("SIGNAL LOST");
  });
});
