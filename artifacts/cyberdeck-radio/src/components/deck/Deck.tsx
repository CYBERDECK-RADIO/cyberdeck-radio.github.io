/**
 * Presentational retro deck: VFD display, cassette reels, simulated spectrum,
 * and transport controls. Owns no playback — it renders controller state and
 * forwards user actions through callbacks.
 *
 *   props: station + PlaybackState + volume ──▶ VFD / reels / spectrum / transport
 *   user actions ──▶ onTogglePlayback / onStop / onVolumeChange
 *
 * The visualizer is labeled SIMULATED unless a working analyser is connected.
 */

import { useEffect, useRef } from "react";
import { Pause, Play, Square, Volume2 } from "lucide-react";
import type { PlaybackState } from "@/audio/audio-controller";
import { createSimulatedSpectrum, resolveVisualizerMode } from "@/audio/visualizer";
import { stationLocationLabel } from "@/stations/station-meta";
import type Station from "@/stations/types";
import { toDeckDisplay } from "./deck-display";

const SPECTRUM_BARS = 24;
const CANVAS_WIDTH = 240;
const CANVAS_HEIGHT = 48;

type DeckProps = {
  station: Station | null;
  playback: PlaybackState;
  volume: number;
  onTogglePlayback: () => void;
  onStop: () => void;
  onVolumeChange: (value: number) => void;
};

function SpectrumCanvas({ bars }: { bars: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const spectrum = createSimulatedSpectrum(bars);
    let frame = 0;
    let running = true;

    const draw = () => {
      if (!running) return;
      const levels = spectrum();
      context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      const barWidth = CANVAS_WIDTH / bars;
      for (let index = 0; index < bars; index += 1) {
        const height = Math.max(2, levels[index] * CANVAS_HEIGHT);
        context.fillStyle = "#d5b466";
        context.globalAlpha = 0.85;
        context.fillRect(index * barWidth + 1, CANVAS_HEIGHT - height, barWidth - 2, height);
      }
      context.globalAlpha = 1;
      frame = typeof requestAnimationFrame === "function" ? requestAnimationFrame(draw) : 0;
    };

    if (typeof requestAnimationFrame === "function") frame = requestAnimationFrame(draw);
    else draw();

    return () => {
      running = false;
      if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
    };
  }, [bars]);

  return (
    <canvas
      ref={canvasRef}
      className="deck-visualizer__canvas"
      data-testid="deck-visualizer-canvas"
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
      aria-hidden="true"
    />
  );
}

export default function Deck({
  station,
  playback,
  volume,
  onTogglePlayback,
  onStop,
  onVolumeChange,
}: DeckProps) {
  const display = toDeckDisplay(playback);
  const visualizerMode = resolveVisualizerMode(false);
  const stream = station?.streams[0];

  return (
    <section
      className={`deck${display.isTuning ? " is-tuning" : ""}`}
      aria-label="Audio deck"
      data-testid="deck"
    >
      <div className="deck-display" data-testid="deck-display">
        <div className="deck-display__row">
          <span className="deck-display__label">NOW TUNING</span>
          <span
            className={`deck-display__status deck-display__status--${display.statusTone}`}
            data-testid="deck-status"
          >
            {display.statusLabel}
          </span>
        </div>
        <div className="deck-display__name" data-testid="deck-station-name">
          {station?.name || "NO STATION LOCKED"}
        </div>
        <div className="deck-display__meta" data-testid="deck-meta">
          <span>{station ? stationLocationLabel(station) : "SELECT A STATION TO BEGIN"}</span>
          {stream?.codec && (
            <span>
              {stream.codec.toUpperCase()}
              {stream.bitrate ? ` · ${stream.bitrate} KBPS` : ""}
            </span>
          )}
        </div>
      </div>

      <div className="deck-reels" aria-hidden="true">
        <span className="deck-reel" />
        <span className="deck-reel" />
      </div>

      <div className="deck-visualizer">
        <SpectrumCanvas bars={SPECTRUM_BARS} />
        <span className="deck-visualizer__mode" data-testid="deck-visualizer-mode">
          {visualizerMode === "simulated" ? "SIMULATED" : "ANALYSER"}
        </span>
      </div>

      <div className="deck-transport">
        <button
          type="button"
          className="deck-transport__button"
          onClick={onTogglePlayback}
          disabled={!station}
          aria-label={display.isTuning ? "Pause station" : "Play station"}
          aria-pressed={display.isTuning}
          data-testid="deck-play-button"
        >
          {display.isTuning ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        </button>
        <button
          type="button"
          className="deck-transport__button"
          onClick={onStop}
          disabled={playback.status === "idle"}
          aria-label="Stop station"
          data-testid="deck-stop-button"
        >
          <Square aria-hidden="true" />
        </button>
        <label className="deck-transport__volume">
          <Volume2 aria-hidden="true" />
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(event) => onVolumeChange(Number(event.target.value))}
            aria-label="Playback volume"
            data-testid="deck-volume"
          />
        </label>
      </div>

      {playback.status === "error" && (
        <p className="deck-error" role="alert" data-testid="deck-error">
          {playback.message}
        </p>
      )}
    </section>
  );
}