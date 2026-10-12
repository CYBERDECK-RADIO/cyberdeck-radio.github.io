/**
 * Lightweight, persisted user preferences.
 *
 *   defaults ──▶ parsePreferences(stored) ──▶ Preferences (+clamping)
 *   volume / visualizerStyle / theme / soundCues ──▶ localStorage (one JSON blob)
 *
 * Only small, local values live here — no account, no server. Parsing is total:
 * any malformed or missing input falls back to the defaults rather than throwing.
 */

import { DEFAULT_THEME_ID, isThemeId, type ThemeId } from "./themes";

export type VisualizerStyle = "spectrum" | "vu";

export type Preferences = {
  volume: number;
  visualizerStyle: VisualizerStyle;
  theme: ThemeId;
  /** Whether themed interface cues play on interaction. */
  soundCues: boolean;
};

export const PREFERENCES_STORAGE_KEY = "cyberdeck-radio:preferences";

export const DEFAULT_PREFERENCES: Preferences = {
  volume: 0.8,
  visualizerStyle: "spectrum",
  theme: DEFAULT_THEME_ID,
  soundCues: true,
};

export function clampVolume(value: unknown): number {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(numeric)) return DEFAULT_PREFERENCES.volume;
  return Math.min(1, Math.max(0, numeric));
}

export function isVisualizerStyle(value: unknown): value is VisualizerStyle {
  return value === "spectrum" || value === "vu";
}

export function nextVisualizerStyle(style: VisualizerStyle): VisualizerStyle {
  return style === "spectrum" ? "vu" : "spectrum";
}

export function parsePreferences(raw: unknown): Preferences {
  if (raw === null || typeof raw !== "object") {
    return { ...DEFAULT_PREFERENCES };
  }
  const candidate = raw as Partial<Record<keyof Preferences, unknown>>;
  return {
    volume: clampVolume(candidate.volume ?? DEFAULT_PREFERENCES.volume),
    visualizerStyle: isVisualizerStyle(candidate.visualizerStyle)
      ? candidate.visualizerStyle
      : DEFAULT_PREFERENCES.visualizerStyle,
    theme: isThemeId(candidate.theme) ? candidate.theme : DEFAULT_PREFERENCES.theme,
    soundCues:
      typeof candidate.soundCues === "boolean"
        ? candidate.soundCues
        : DEFAULT_PREFERENCES.soundCues,
  };
}
