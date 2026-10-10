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
  setVolume: (value: number) => void;
  setVisualizerStyle: (style: VisualizerStyle) => void;
  cycleVisualizerStyle: () => void;
} {
  const [preferences, setPreferences] = useState<Preferences>(readPreferences);

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
    setVolume: (value) =>
      setPreferences((current) => ({ ...current, volume: clampVolume(value) })),
    setVisualizerStyle: (style) =>
      setPreferences((current) => ({ ...current, visualizerStyle: style })),
    cycleVisualizerStyle: () =>
      setPreferences((current) => ({
        ...current,
        visualizerStyle: nextVisualizerStyle(current.visualizerStyle),
      })),
  };
}
