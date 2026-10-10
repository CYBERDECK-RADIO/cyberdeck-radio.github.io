/**
 * Honest visualization: simulated spectrum by default, analyser only when a
 * working Web Audio path exists.
 *
 *   bars + seed ──▶ createSimulatedSpectrum ──▶ next() ──▶ levels[0..1]
 *   analyserConnected ──▶ resolveVisualizerMode ──▶ "simulated" | "analyser"
 *
 * The deck always starts in simulated mode; analyser mode is gated behind a
 * tested Web Audio connection so CORS-blocked streams never show fake analysis.
 */

export type VisualizerMode = "simulated" | "analyser";

export type SpectrumSource = () => number[];

export function createSimulatedSpectrum(bars: number, seed = 1): SpectrumSource {
  const random = mulberry32(seed);
  const levels = Array.from({ length: bars }, () => random());
  const targets = Array.from({ length: bars }, () => random());

  return () => {
    for (let index = 0; index < bars; index += 1) {
      if (random() < 0.12) targets[index] = random();
      levels[index] += (targets[index] - levels[index]) * 0.18;
      levels[index] = clamp01(levels[index] + (random() - 0.5) * 0.06);
    }
    return levels.slice();
  };
}

export function resolveVisualizerMode(analyserConnected: boolean): VisualizerMode {
  return analyserConnected ? "analyser" : "simulated";
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}