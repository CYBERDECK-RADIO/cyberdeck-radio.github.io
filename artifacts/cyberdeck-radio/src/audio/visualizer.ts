/**
 * Audio visualizer taps.
 *
 * The spectrum is driven by the real audio whenever a safe Web Audio tap
 * exists, and honestly falls back to a simulated animation otherwise:
 *
 *   captureStream() + AudioContext + AnalyserNode ──▶ createCaptureAnalyser
 *   analyser ──▶ createAnalyserSpectrum ──▶ getLevels(bars) ──▶ levels[0..1]
 *   bars + seed ──▶ createSimulatedSpectrum ──▶ next() ──▶ levels[0..1]
 *
 * captureStream() taps the element's output without re-routing it, so a stream
 * that is not CORS-readable yields silence here but still plays normally — the
 * deck detects the flat signal and reverts to the simulated animation.
 */

import type { AnalyserLike, MediaElementLike } from "./audio-controller";

export type VisualizerMode = "simulated" | "analyser";

export type SpectrumSource = () => number[];

/** Levels below this count as "no audible signal" for the honesty check. */
export const ANALYSER_SIGNAL_THRESHOLD = 0.02;

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

export function createAnalyserSpectrum(analyser: AnalyserLike, bars: number): SpectrumSource {
  return () => analyser.getLevels(bars);
}

export function analyserHasSignal(
  levels: number[],
  threshold = ANALYSER_SIGNAL_THRESHOLD,
): boolean {
  for (const level of levels) {
    if (level > threshold) return true;
  }
  return false;
}

export function resolveVisualizerMode(analyserConnected: boolean): VisualizerMode {
  return analyserConnected ? "analyser" : "simulated";
}

/**
 * Taps a media element's audio via captureStream() → AudioContext → AnalyserNode.
 * Returns null when the browser lacks the APIs; never throws.
 */
export function createCaptureAnalyser(media: MediaElementLike): AnalyserLike | null {
  const AudioContextCtor =
    (globalThis as { AudioContext?: typeof AudioContext }).AudioContext ??
    (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  const capture = (media as unknown as { captureStream?: () => MediaStream }).captureStream;
  if (!AudioContextCtor || typeof capture !== "function") return null;

  try {
    const context = new AudioContextCtor();
    const stream = capture.call(media);
    const source = context.createMediaStreamSource(stream);
    const node = context.createAnalyser();
    node.fftSize = 256;
    node.smoothingTimeConstant = 0.82;
    source.connect(node);
    const bins = new Uint8Array(node.frequencyBinCount);

    return {
      resume: () => {
        void context.resume().catch(() => {});
      },
      dispose: () => {
        try {
          source.disconnect();
          node.disconnect();
          void context.close();
        } catch {
          // A already-closed context is fine to ignore.
        }
      },
      getLevels: (bars: number) => {
        node.getByteFrequencyData(bins);
        return downsampleBins(bins, bars);
      },
    };
  } catch {
    return null;
  }
}

function downsampleBins(bins: Uint8Array, bars: number): number[] {
  if (bars <= 0) return [];
  const levels = new Array<number>(bars).fill(0);
  // Weight low frequencies more heavily so the spectrum reads like music.
  const usable = Math.max(1, Math.floor(bins.length * 0.72));
  const perBar = usable / bars;
  for (let bar = 0; bar < bars; bar += 1) {
    const start = Math.floor(bar * perBar);
    const end = Math.max(start + 1, Math.floor((bar + 1) * perBar));
    let peak = 0;
    for (let index = start; index < end && index < bins.length; index += 1) {
      peak = Math.max(peak, bins[index]);
    }
    levels[bar] = clamp01(peak / 255);
  }
  return levels;
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