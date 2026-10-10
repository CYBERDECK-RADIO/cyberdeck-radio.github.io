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
import type { VisualizerStyle } from "@/preferences/preferences";
import { stationLocationLabel } from "@/stations/station-meta";
import type { HealthStatus } from "@/stations/stream-health-logic";
import type Station from "@/stations/types";
import { toDeckDisplay } from "./deck-display";

const SPECTRUM_BARS = 24;
const CANVAS_WIDTH = 240;
const CANVAS_HEIGHT = 48;
const ACCENT = "#d5b466";
const ACCENT_SOFT = "#f2e3b6";

const HEALTH_LABELS: Record<HealthStatus, string> = {
  live: "LIVE",
  offline: "OFFLINE",
  checking: "CHECKING",
  unknown: "UNKNOWN",
};

type DeckProps = {
  station: Station | null;
  playback: PlaybackState;
  volume: number;
  health?: HealthStatus;
  onTogglePlayback: () => void;
  onStop: () => void;
  onVolumeChange: (value: number) => void;
  visualizerStyle?: VisualizerStyle;
  onCycleVisualizerStyle?: () => void;
};

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function drawBars(context: CanvasRenderingContext2D, levels: number[], bars: number): void {
  const barWidth = CANVAS_WIDTH / bars;
  context.fillStyle = ACCENT;
  context.globalAlpha = 0.85;
  for (let index = 0; index < bars; index += 1) {
    const height = Math.max(2, levels[index] * CANVAS_HEIGHT);
    context.fillRect(index * barWidth + 1, CANVAS_HEIGHT - height, barWidth - 2, height);
  }
  context.globalAlpha = 1;
}

function drawVu(context: CanvasRenderingContext2D, levels: number[], peaks: number[]): void {
  const half = Math.floor(levels.length / 2);
  const channels = [average(levels.slice(0, half)), average(levels.slice(half))];
  const meterWidth = 54;
  const gap = 24;
  const startX = (CANVAS_WIDTH - (meterWidth * 2 + gap)) / 2;

  context.globalAlpha = 0.9;
  channels.forEach((value, index) => {
    const x = startX + index * (meterWidth + gap);
    context.fillStyle = "rgba(213,180,102,0.16)";
    context.fillRect(x, 0, meterWidth, CANVAS_HEIGHT);
    const height = Math.max(2, value * CANVAS_HEIGHT);
    context.fillStyle = ACCENT;
    context.fillRect(x, CANVAS_HEIGHT - height, meterWidth, height);
    peaks[index] = Math.max(peaks[index] * 0.92, height);
    context.fillStyle = ACCENT_SOFT;
    context.fillRect(x, CANVAS_HEIGHT - peaks[index] - 1, meterWidth, 2);
  });
  context.globalAlpha = 1;
}

function SpectrumCanvas({ bars, style }: { bars: number; style: VisualizerStyle }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const spectrum = createSimulatedSpectrum(bars);
    const peaks = [0, 0];
    let frame = 0;
    let running = true;

    const draw = () => {
      if (!running) return;
      const levels = spectrum();
      context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      if (style === "vu") drawVu(context, levels, peaks);
      else drawBars(context, levels, bars);
      frame = typeof requestAnimationFrame === "function" ? requestAnimationFrame(draw) : 0;
    };

    if (typeof requestAnimationFrame === "function") frame = requestAnimationFrame(draw);
    else draw();

    return () => {
      running = false;
      if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
    };
  }, [bars, style]);

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
  health = "unknown",
  onTogglePlayback,
  onStop,
  onVolumeChange,
  visualizerStyle = "spectrum",
  onCycleVisualizerStyle,
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
          {station && (
            <span className={`deck-health health-${health}`} data-testid="deck-health">
              {HEALTH_LABELS[health]}
            </span>
          )}
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
        <SpectrumCanvas bars={SPECTRUM_BARS} style={visualizerStyle} />
        <span className="deck-visualizer__mode" data-testid="deck-visualizer-mode">
          {visualizerMode === "simulated" ? "SIMULATED" : "ANALYSER"}
        </span>
        {onCycleVisualizerStyle && (
          <button
            type="button"
            className="deck-visualizer__style"
            onClick={onCycleVisualizerStyle}
            aria-label={`Visualizer style: ${visualizerStyle === "spectrum" ? "Spectrum" : "VU"}. Switch style`}
            data-testid="deck-visualizer-style"
          >
            {visualizerStyle === "spectrum" ? "SPECTRUM" : "VU"}
          </button>
        )}
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