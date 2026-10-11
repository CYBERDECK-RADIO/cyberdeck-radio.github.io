/**
 * Random channel picker for the "surprise me" tuner.
 *
 *   Station[] ──▶ pickRandomStation ──▶ Station | null
 *
 * The pool is usually the visible (filter-applied) directory. The currently
 * locked station is skipped when anything else is available, so repeated
 * shuffles keep moving instead of landing on the same channel twice; the RNG
 * is injectable so tests stay deterministic.
 */

import type Station from "./types";

type PickRandomOptions = {
  /** Station to avoid re-picking while any other candidate exists. */
  excludeId?: string | null;
  /** RNG override; defaults to Math.random. */
  random?: () => number;
};

export function pickRandomStation(
  stations: Station[],
  { excludeId, random = Math.random }: PickRandomOptions = {},
): Station | null {
  if (stations.length === 0) return null;

  const pool =
    excludeId && stations.length > 1
      ? stations.filter((station) => station.id !== excludeId)
      : stations;
  if (pool.length === 0) return null;

  const sample = random();
  const index = Math.min(pool.length - 1, Math.max(0, Math.floor(sample * pool.length)));
  return pool[index] ?? null;
}
