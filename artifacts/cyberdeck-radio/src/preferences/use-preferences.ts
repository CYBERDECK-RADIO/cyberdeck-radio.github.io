import { useEffect, useState } from "react";

import {
  DEFAULT_PREFERENCES,
  PREFERENCES_STORAGE_KEY,
  clampVolume,
  nextVisualizerStyle,
  parsePreferences,
  type Preferences,
  type VisualizerStyle,
} from "./preferences";
import { applyThemeToDocument, isThemeId, nextThemeId, type ThemeId } from "./themes";

function readPreferences(): Preferences {
  if (typeof window === "undefined") {
    return { ...DEFAULT_PREFERENCES };
  }
  try {
    const stored = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
    return stored ? parsePreferences(JSON.parse(stored)) : { ...DEFAULT_PREFERENCES };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function usePreferences(): {
  preferences: Preferences;
  volume: number;
  visualizerStyle: VisualizerStyle;
  theme: ThemeId;
  soundCues: boolean;
  setVolume: (value: number) => void;
  setVisualizerStyle: (style: VisualizerStyle) => void;
  cycleVisualizerStyle: () => void;
  setTheme: (theme: ThemeId) => void;
  cycleTheme: () => void;
  setSoundCues: (enabled: boolean) => void;
  toggleSoundCues: () => void;
} {
  const [preferences, setPreferences] = useState<Preferences>(() => {
    const initial = readPreferences();
    // Paint the saved theme before the first render (including the shader
    // backdrop's first palette read) so a reload never flashes the default.
    applyThemeToDocument(initial.theme);
    return initial;
  });

  useEffect(() => {
    applyThemeToDocument(preferences.theme);
  }, [preferences.theme]);

  useEffect(() => {
    try {
      window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      return;
    }
  }, [preferences]);

  return {
    preferences,
    volume: preferences.volume,
    visualizerStyle: preferences.visualizerStyle,
    theme: preferences.theme,
    soundCues: preferences.soundCues,
    setVolume: (value) =>
      setPreferences((current) => ({ ...current, volume: clampVolume(value) })),
    setVisualizerStyle: (style) =>
      setPreferences((current) => ({ ...current, visualizerStyle: style })),
    cycleVisualizerStyle: () =>
      setPreferences((current) => ({
        ...current,
        visualizerStyle: nextVisualizerStyle(current.visualizerStyle),
      })),
    setTheme: (theme) =>
      setPreferences((current) => {
        if (!isThemeId(theme) || theme === current.theme) return current;
        // Apply the token block synchronously so the re-render — and the GPU
        // backdrop that reads computed styles — sees the new palette at once.
        applyThemeToDocument(theme);
        return { ...current, theme };
      }),
    cycleTheme: () =>
      setPreferences((current) => {
        const next = nextThemeId(current.theme);
        applyThemeToDocument(next);
        return { ...current, theme: next };
      }),
    setSoundCues: (enabled) =>
      setPreferences((current) => ({ ...current, soundCues: enabled })),
    toggleSoundCues: () =>
      setPreferences((current) => ({ ...current, soundCues: !current.soundCues })),
  };
}
