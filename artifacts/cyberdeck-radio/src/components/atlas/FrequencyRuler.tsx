/**
 * The frequency ruler docked at the bottom of the atlas.
 *
 *   selected station ──▶ synthetic carrier ──▶ needle + read-out
 *   drag the dial ──▶ preview needle ──▶ release on nearest carrier ──▶ tune
 *
 * Internet streams have no dial position, so the band is synthetic (each station
 * gets a stable hash-derived FM frequency). The overlay range input is invisible
 * but keyboard-operable, so arrow keys retune like a real radio.
 *
 * React collapses a range drag into a stream of `input` events (its onChange),
 * so the preview rides those ticks while the actual tune waits for the native
 * `change` event — the moment the pointer is released or a key lands.
 */

import { useEffect, useRef, useState } from "react";
import type Station from "@/stations/types";
import {
  FM_BAND_MAX,
  FM_BAND_MIN,
  formatFrequency,
  frequencyPercent,
  nearestStationByFrequency,
  stationFrequency,
} from "@/stations/frequency";

type FrequencyRulerProps = {
  stations: readonly Station[];
  selectedStationId: string | null;
  /** Fires when the dial settles on a new carrier (autoplay). */
  onTune: (stationId: string) => void;
};

const TICK_STEP = 4;
const TICKS: number[] = [];
for (let value = 88; value <= 108; value += TICK_STEP) TICKS.push(value);

export default function FrequencyRuler({
  stations,
  selectedStationId,
  onTune,
}: FrequencyRulerProps) {
  const selected = stations.find((station) => station.id === selectedStationId) ?? null;
  const dialRef = useRef<HTMLInputElement>(null);
  const onTuneRef = useRef(onTune);
  const [preview, setPreview] = useState<number | null>(null);
  const committedRef = useRef(selected ? stationFrequency(selected.id) : null);

  onTuneRef.current = onTune;

  const needleFrequency = preview ?? (selected ? stationFrequency(selected.id) : null);
  const readout = needleFrequency ?? committedRef.current;

  useEffect(() => {
    committedRef.current = selected ? stationFrequency(selected.id) : null;
    setPreview(null);
    if (selected && dialRef.current) dialRef.current.value = String(stationFrequency(selected.id));
  }, [selected]);

  useEffect(() => {
    const dial = dialRef.current;
    if (!dial) return;
    const handleChange = () => {
      const next = Number(dial.value);
      const nearest = nearestStationByFrequency(stations, next);
      if (nearest) {
        committedRef.current = stationFrequency(nearest.id);
        onTuneRef.current(nearest.id);
      }
      setPreview(null);
    };
    dial.addEventListener("change", handleChange);
    return () => dial.removeEventListener("change", handleChange);
  }, [stations]);

  return (
    <footer className="ruler" data-testid="frequency-ruler">
      <div className="ruler__label">
        <span>Carrier</span>
        <span className="ruler__readout" data-testid="text-frequency-readout">
          {readout === null ? "—.—" : formatFrequency(readout)}
        </span>
      </div>

      <div className="ruler__track">
        <span className="ruler__baseline" aria-hidden="true" />
        {TICKS.map((value) => (
          <span
            key={value}
            className="ruler__tick"
            style={{ left: `${frequencyPercent(value)}%` }}
            aria-hidden="true"
          >
            <span className="ruler__tick-line" />
            <span className="ruler__tick-label">{value}</span>
          </span>
        ))}
        {needleFrequency !== null && (
          <span
            className={`ruler__needle${preview !== null ? " is-preview" : ""}`}
            style={{ left: `${frequencyPercent(needleFrequency)}%` }}
            data-testid="ruler-needle"
            aria-hidden="true"
          >
            <span className="ruler__needle-glow" />
            <span className="ruler__needle-head" />
          </span>
        )}
        <input
          ref={dialRef}
          className="ruler__dial"
          type="range"
          min={FM_BAND_MIN}
          max={FM_BAND_MAX}
          step={0.05}
          defaultValue={selected ? stationFrequency(selected.id) : (FM_BAND_MIN + FM_BAND_MAX) / 2}
          aria-label="Frequency dial"
          data-testid="range-frequency-dial"
          onChange={(event) => setPreview(Number(event.currentTarget.value))}
          onBlur={() => setPreview(null)}
        />
      </div>
    </footer>
  );
}
