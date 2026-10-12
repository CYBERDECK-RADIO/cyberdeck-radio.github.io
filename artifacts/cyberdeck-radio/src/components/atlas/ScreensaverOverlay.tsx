/**
 * The screen saver: the atlas gone quiet.
 *
 *   engaged atlas ──▶ dimmed canvas ──▶ centered station identity + local-time
 *   -                                    analogue dial (never UTC)
 *   station + PlaybackState + health ──▶ name / carrier / status / meter
 *   transport inside ──▶ data-screensaver-control (keeps the saver running)
 *   wake button + any deliberate input ──▶ onWake
 *
 * A sibling overlay rather than a route: the header, ruler, dossier, and dock
 * stay mounted behind it (dimmed by CSS), so waking restores the exact view —
 * zen mode included — the listener walked away from.
 */

import { useEffect, useState } from "react";
import { Pause, Play, Sun } from "lucide-react";
import type { AnalyserLike, PlaybackState } from "@/audio/audio-controller";
import { formatLocalClock } from "@/lib/clock";
import { formatFrequency, stationFrequency } from "@/stations/frequency";
import { HEALTH_LABELS, stationLocationLabel } from "@/stations/station-meta";
import type { HealthStatus } from "@/stations/stream-health-logic";
import type Station from "@/stations/types";
import AnalogueClock from "./AnalogueClock";
import LevelMeter from "./LevelMeter";
import { toDossierDisplay } from "./dossier-display";

type ScreensaverOverlayProps = {
  station: Station | null;
  playback: PlaybackState;
  health?: HealthStatus;
  analyser?: AnalyserLike | null;
  onTogglePlayback: () => void;
  onWake: () => void;
};

export default function ScreensaverOverlay({
  station,
  playback,
  health = "unknown",
  analyser = null,
  onTogglePlayback,
  onWake,
}: ScreensaverOverlayProps) {
  const display = toDossierDisplay(playback);
  const [now, setNow] = useState(() => new Date());
  const localTime = formatLocalClock(now);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const carrier = station
    ? `${formatFrequency(stationFrequency(station.id))} MHz · ${stationLocationLabel(station)}`
    : "No carrier locked";

  return (
    <section className="screensaver" aria-label="Screen saver" data-testid="screensaver">
      <div className="screensaver__inner">
        <p className="screensaver__brand">
          <span className="screensaver__brand-dot" aria-hidden="true" />
          Radio Atlas
        </p>

        <h1 className="screensaver__title" data-testid="screensaver-station-name">
          {station?.name || "No station locked"}
        </h1>

        <p className="screensaver__carrier" data-testid="screensaver-carrier">
          {carrier}
        </p>

        <div className="screensaver__meter">
          <LevelMeter
            analyser={analyser}
            active={playback.status === "playing"}
            stationId={station?.id ?? null}
          />
        </div>

        <p className="screensaver__status">
          <span className={`tone-${display.statusTone}`}>{display.statusLabel}</span>
          {station && (
            <span className={`screensaver__health health-${health}`}>
              {HEALTH_LABELS[health]}
            </span>
          )}
        </p>

        <figure
          className="screensaver__clock"
          data-testid="screensaver-clock"
          aria-label={`Local time ${localTime}`}
        >
          <AnalogueClock date={now} />
          <time className="screensaver__clock-time" dateTime={localTime}>
            {localTime}
          </time>
        </figure>

        <div className="screensaver__controls">
          <button
            type="button"
            className="screensaver__button screensaver__button--primary"
            data-screensaver-control=""
            onClick={onTogglePlayback}
            disabled={!station}
            aria-label={display.isTuning ? "Pause station" : "Play station"}
            aria-pressed={display.isTuning}
            data-testid="screensaver-play"
          >
            {display.isTuning ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
          </button>
          <button
            type="button"
            className="screensaver__button screensaver__button--wake"
            onClick={onWake}
            data-testid="button-wake-screensaver"
          >
            <Sun aria-hidden="true" />
            <span>Wake the atlas</span>
          </button>
        </div>

        <p className="screensaver__hint">Any key, click, or scroll brings the atlas back</p>
      </div>
    </section>
  );
}
