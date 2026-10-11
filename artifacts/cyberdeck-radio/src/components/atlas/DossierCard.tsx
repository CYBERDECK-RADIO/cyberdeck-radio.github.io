/**
 * The floating dossier player card — the only transport surface.
 *
 *   station + PlaybackState + health ──▶ identity / carrier / status / meter
 *   user actions ──▶ onHop / onTogglePlayback / onStop / onVolumeChange
 *   channel keeping ──▶ pin (shelf), share (copy link), sleep timer
 *
 * Owns no playback: it renders controller state. The eight-hairline meter
 * tracks the real analyser when a safe tap exists and stays honestly labeled
 * SIMULATED when it cannot. The hop pair steps through the current result set
 * so a visitor can flip channels without going back to the directory.
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Link2,
  Pause,
  Pin,
  Play,
  Square,
  Timer,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { AnalyserLike, PlaybackState } from "@/audio/audio-controller";
import { resolveVisualizerMode } from "@/audio/visualizer";
import { formatFrequency, stationFrequency } from "@/stations/frequency";
import { HEALTH_LABELS, countryFlag, stationLocationLabel } from "@/stations/station-meta";
import type { HealthStatus } from "@/stations/stream-health-logic";
import type Station from "@/stations/types";
import { SLEEP_TIMER_MINUTES } from "@/modes/sleep-timer";
import type { SleepTimerState } from "@/modes/use-sleep-timer";
import LevelMeter from "./LevelMeter";
import { toDossierDisplay } from "./dossier-display";

export type ShareState = "idle" | "copied" | "failed";

type DossierCardProps = {
  station: Station | null;
  playback: PlaybackState;
  volume: number;
  health?: HealthStatus;
  analyser?: AnalyserLike | null;
  playing?: boolean;
  caption?: ReactNode;
  /** False when there is only one channel to step between. */
  canHop?: boolean;
  /** The tuned channel is on the pinned shelf. */
  pinned?: boolean;
  /** Mute read-out for the volume control. */
  muted?: boolean;
  /** Result of the last share attempt; fades back to idle on its own. */
  shareState?: ShareState;
  /** Live sleep-timer state — armed, and its remaining read-out. */
  sleep?: Pick<SleepTimerState, "armed" | "remainingLabel">;
  /** Steps the selection through the result set (−1 previous, +1 next). */
  onHop?: (direction: -1 | 1) => void;
  onTogglePlayback: () => void;
  onStop: () => void;
  onVolumeChange: (value: number) => void;
  onToggleMute?: () => void;
  onTogglePin?: () => void;
  onShare?: () => void;
  onArmSleep?: (minutes: number) => void;
  onCancelSleep?: () => void;
};

function formatCoordinate(value: number, axis: "lat" | "lng"): string {
  const hemisphere =
    axis === "lat" ? (value >= 0 ? "N" : "S") : value >= 0 ? "E" : "W";
  return `${Math.abs(value).toFixed(2)}° ${hemisphere}`;
}

function formatCoordinates(station: Station | null): string {
  const coordinates = station?.coordinates;
  if (!coordinates) return "Coordinates unlisted";
  const [longitude, latitude] = coordinates;
  return `${formatCoordinate(latitude, "lat")} · ${formatCoordinate(longitude, "lng")}`;
}

export default function DossierCard({
  station,
  playback,
  volume,
  health = "unknown",
  analyser = null,
  playing = false,
  caption,
  canHop = false,
  pinned = false,
  muted = false,
  shareState = "idle",
  sleep,
  onHop,
  onTogglePlayback,
  onStop,
  onVolumeChange,
  onToggleMute,
  onTogglePin,
  onShare,
  onArmSleep,
  onCancelSleep,
}: DossierCardProps) {
  const display = toDossierDisplay(playback);
  const [analyserVerified, setAnalyserVerified] = useState(false);
  const handleAnalyserSignal = useCallback(() => setAnalyserVerified(true), []);
  const [sleepMenuOpen, setSleepMenuOpen] = useState(false);
  const sleepRef = useRef<HTMLDivElement>(null);
  const handleSleepMenuToggle = () => setSleepMenuOpen((open) => !open);
  const handleSleepChoice = (minutes: number) => {
    setSleepMenuOpen(false);
    onArmSleep?.(minutes);
  };
  const handleSleepOff = () => {
    setSleepMenuOpen(false);
    onCancelSleep?.();
  };
  useEffect(() => {
    if (!sleepMenuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (sleepRef.current && !sleepRef.current.contains(event.target as Node)) {
        setSleepMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [sleepMenuOpen]);
  const stream = station?.streams[0];
  const mode = resolveVisualizerMode(Boolean(analyser) && analyserVerified);
  const flag = station ? countryFlag(station.countryCode) : null;

  return (
    <section
      className={`dossier${station ? "" : " is-empty"}`}
      id="player"
      tabIndex={-1}
      aria-label="Now playing"
      data-testid="deck"
    >
      <header className="dossier__head">
        <span className="dossier__location" data-testid="dossier-location">
          {station ? (
            <>
              {flag && (
                <span
                  className="dossier__flag"
                  data-testid="dossier-flag"
                  role="img"
                  aria-label={station.country ?? station.countryCode}
                >
                  {flag}
                </span>
              )}
              {stationLocationLabel(station)}
            </>
          ) : (
            "No station locked"
          )}
        </span>
        <span className="dossier__carrier" data-testid="dossier-frequency">
          {station ? `${formatFrequency(stationFrequency(station.id))} MHz` : "—.—— MHz"}
        </span>
      </header>

      <div className="dossier__title-row">
        <h1 className="dossier__title" data-testid="deck-station-name">
          {station?.name || "No station locked"}
        </h1>
        <div className="dossier__actions">
          <button
            type="button"
            className={`dossier__action${pinned ? " is-on" : ""}`}
            onClick={onTogglePin}
            disabled={!station}
            aria-pressed={pinned}
            aria-label={pinned ? "Unpin channel" : "Pin channel"}
            title={pinned ? "Unpin channel" : "Pin channel"}
            data-testid="deck-pin-button"
          >
            <Pin aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`dossier__action${shareState === "copied" ? " is-on" : ""}`}
            onClick={onShare}
            disabled={!station}
            aria-label={shareState === "copied" ? "Link copied" : "Copy share link"}
            title={shareState === "copied" ? "Link copied" : "Copy share link"}
            data-testid="deck-share-button"
          >
            <Link2 aria-hidden="true" />
          </button>
          {shareState !== "idle" && (
            <span className="dossier__share-flag" role="status" data-testid="deck-share-state">
              {shareState === "copied" ? "LINK COPIED" : "COPY FAILED"}
            </span>
          )}
        </div>
      </div>
      <p className="dossier__coords" data-testid="dossier-coordinates">
        {formatCoordinates(station)}
      </p>

      <div className="dossier__status">
        <div className="dossier__status-row">
          <span
            className={`dossier__status-label tone-${display.statusTone}`}
            data-testid="deck-status"
          >
            {display.statusLabel}
          </span>
          {station && (
            <span className={`dossier__health health-${health}`} data-testid="deck-health">
              {HEALTH_LABELS[health]}
            </span>
          )}
          {station && sleep?.armed && (
            <span className="dossier__sleep-readout" data-testid="deck-sleep-remaining">
              SLEEP {sleep.remainingLabel}
            </span>
          )}
          {station && (
            <span className="dossier__mode" data-testid="deck-visualizer-mode">
              {mode === "simulated" ? "Simulated" : "Analyser"}
            </span>
          )}
        </div>
        <LevelMeter
          analyser={analyser}
          active={playing}
          stationId={station?.id ?? null}
          onSignal={handleAnalyserSignal}
        />
        <p className="dossier__meta" data-testid="deck-meta">
          <span aria-hidden="true">NOW ON AIR</span>
          {stream?.codec ? (
            <span>
              {stream.codec.toUpperCase()}
              {stream.bitrate ? ` · ${stream.bitrate} KBPS` : ""}
            </span>
          ) : (
            <span>{display.statusTone === "error" ? "Retune to try again" : "Awaiting carrier"}</span>
          )}
        </p>
      </div>

      <div className="dossier__transport">
        <button
          type="button"
          className="dossier__button dossier__button--step"
          onClick={() => onHop?.(-1)}
          disabled={!station || !canHop}
          aria-label="Previous channel"
          data-testid="deck-prev-button"
        >
          <ChevronLeft aria-hidden="true" />
        </button>
        <button
          type="button"
          className="dossier__button dossier__button--primary"
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
          className="dossier__button dossier__button--step"
          onClick={() => onHop?.(1)}
          disabled={!station || !canHop}
          aria-label="Next channel"
          data-testid="deck-next-button"
        >
          <ChevronRight aria-hidden="true" />
        </button>
        <button
          type="button"
          className="dossier__button"
          onClick={onStop}
          disabled={playback.status === "idle"}
          aria-label="Stop station"
          data-testid="deck-stop-button"
        >
          <Square aria-hidden="true" />
        </button>
        <div className="dossier__sleep" ref={sleepRef}>
          <button
            type="button"
            className={`dossier__button${sleep?.armed ? " is-active" : ""}`}
            onClick={handleSleepMenuToggle}
            disabled={!station}
            aria-haspopup="menu"
            aria-expanded={sleepMenuOpen}
            aria-label={sleep?.armed ? `Sleep timer armed, ${sleep.remainingLabel} remaining` : "Set sleep timer"}
            title="Sleep timer"
            data-testid="deck-sleep-button"
          >
            <Timer aria-hidden="true" />
          </button>
          {sleepMenuOpen && (
            <div className="dossier__sleep-menu" role="menu" data-testid="sleep-timer-menu">
              {SLEEP_TIMER_MINUTES.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  role="menuitemradio"
                  aria-checked={sleep?.armed}
                  onClick={() => handleSleepChoice(minutes)}
                  data-testid={`button-sleep-${minutes}`}
                >
                  {minutes} min
                </button>
              ))}
              {sleep?.armed && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleSleepOff}
                  data-testid="button-sleep-off"
                >
                  Timer off
                </button>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          className={`dossier__mute${muted ? " is-muted" : ""}`}
          onClick={onToggleMute}
          aria-pressed={muted}
          aria-label={muted ? "Unmute" : "Mute"}
          title={muted ? "Unmute" : "Mute"}
          data-testid="deck-mute-button"
        >
          {muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
        </button>
        <label
          className="dossier__volume"
          style={{ "--fill": `${Math.round(volume * 100)}%` } as CSSProperties}
        >
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
        <p className="dossier__error" role="alert" data-testid="deck-error">
          {playback.message}
        </p>
      )}

      {caption && (
        <p className="dossier__caption" aria-live="polite">
          {caption}
        </p>
      )}
    </section>
  );
}
