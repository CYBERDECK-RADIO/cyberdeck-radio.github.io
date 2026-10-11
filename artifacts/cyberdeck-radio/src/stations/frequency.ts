/**
 * Synthetic FM carrier for a station.
 *
 *   Station ──▶ stationFrequency ──▶ 87.50–108.00 MHz
 *   dial value ──▶ nearestStationByFrequency ──▶ nearest station
 *
 * Internet streams have no dial position, so each station gets a stable
 * hash-derived spot on the FM band. The bottom ruler's needle, the dossier's
 * carrier read-out, and the dial-to-station mapping all derive from it.
 */

export const FM_BAND_MIN = 87.5;
export const FM_BAND_MAX = 108;
const STEP = 0.05;
const STEPS = Math.round((FM_BAND_MAX - FM_BAND_MIN) / STEP);

/** Stable hash so a station keeps the same dial position across sessions. */
function hash(input: string): number {
  let value = 0;
  for (let index = 0; index < input.length; index += 1) {
    value = (value * 31 + input.charCodeAt(index)) % 1_000_000;
  }
  return value;
}

export function stationFrequency(id: string): number {
  const steps = hash(id) % (STEPS + 1);
  return Number((FM_BAND_MIN + steps * STEP).toFixed(2));
}

/** "81.30" — always two decimals for the ruler/card read-out. */
export function formatFrequency(mhz: number): string {
  return mhz.toFixed(2);
}

/** Where the needle sits on the ruler, as a 0–100 percent. */
export function frequencyPercent(mhz: number): number {
  const clamped = Math.min(FM_BAND_MAX, Math.max(FM_BAND_MIN, mhz));
  return ((clamped - FM_BAND_MIN) / (FM_BAND_MAX - FM_BAND_MIN)) * 100;
}

export function nearestStationByFrequency<T extends { id: string }>(
  stations: readonly T[],
  mhz: number,
): T | null {
  let best: T | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const station of stations) {
    const delta = Math.abs(stationFrequency(station.id) - mhz);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = station;
    }
  }
  return best;
}
