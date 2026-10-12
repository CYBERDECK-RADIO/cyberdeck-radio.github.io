import { describe, expect, it } from "vitest";

import {
  DEFAULT_PREFERENCES,
  clampVolume,
  isVisualizerStyle,
  nextVisualizerStyle,
  parsePreferences,
} from "./preferences";

describe("clampVolume", () => {
  it("returns the default for non-numeric input", () => {
    expect(clampVolume(undefined)).toBe(DEFAULT_PREFERENCES.volume);
    expect(clampVolume(null)).toBe(DEFAULT_PREFERENCES.volume);
    expect(clampVolume("loud")).toBe(DEFAULT_PREFERENCES.volume);
    expect(clampVolume(Number.NaN)).toBe(DEFAULT_PREFERENCES.volume);
  });

  it("clamps out-of-range values into 0..1", () => {
    expect(clampVolume(-1)).toBe(0);
    expect(clampVolume(2)).toBe(1);
    expect(clampVolume(0.42)).toBeCloseTo(0.42);
  });
});

describe("isVisualizerStyle", () => {
  it("accepts only known styles", () => {
    expect(isVisualizerStyle("spectrum")).toBe(true);
    expect(isVisualizerStyle("vu")).toBe(true);
    expect(isVisualizerStyle("bars")).toBe(false);
    expect(isVisualizerStyle(undefined)).toBe(false);
  });
});

describe("nextVisualizerStyle", () => {
  it("cycles between the two styles", () => {
    expect(nextVisualizerStyle("spectrum")).toBe("vu");
    expect(nextVisualizerStyle("vu")).toBe("spectrum");
  });
});

describe("parsePreferences", () => {
  it("returns defaults for empty or invalid input", () => {
    expect(parsePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences("nope")).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences(42)).toEqual(DEFAULT_PREFERENCES);
  });

  it("keeps valid stored values", () => {
    expect(
      parsePreferences({
        volume: 0.25,
        visualizerStyle: "vu",
        theme: DEFAULT_PREFERENCES.theme,
        soundCues: false,
      }),
    ).toEqual({
      volume: 0.25,
      visualizerStyle: "vu",
      theme: DEFAULT_PREFERENCES.theme,
      soundCues: false,
    });
  });

  it("clamps volume and rejects unknown styles and themes", () => {
    expect(parsePreferences({ volume: 5, visualizerStyle: "bars", theme: "not-a-real-theme" })).toEqual({
      volume: 1,
      visualizerStyle: DEFAULT_PREFERENCES.visualizerStyle,
      theme: DEFAULT_PREFERENCES.theme,
      soundCues: DEFAULT_PREFERENCES.soundCues,
    });
  });

  it("fills missing fields from defaults", () => {
    expect(parsePreferences({ volume: 0.3 })).toEqual({
      volume: 0.3,
      visualizerStyle: DEFAULT_PREFERENCES.visualizerStyle,
      theme: DEFAULT_PREFERENCES.theme,
      soundCues: DEFAULT_PREFERENCES.soundCues,
    });
  });

  it("ignores unknown stored fields", () => {
    expect(parsePreferences({ volume: 0.5, mystery: "x" })).toEqual({
      volume: 0.5,
      visualizerStyle: DEFAULT_PREFERENCES.visualizerStyle,
      theme: DEFAULT_PREFERENCES.theme,
      soundCues: DEFAULT_PREFERENCES.soundCues,
    });
  });

  it("falls back to the default sound cues for a non-boolean stored value", () => {
    expect(parsePreferences({ volume: 0.5, soundCues: "loud" })).toEqual({
      volume: 0.5,
      visualizerStyle: DEFAULT_PREFERENCES.visualizerStyle,
      theme: DEFAULT_PREFERENCES.theme,
      soundCues: DEFAULT_PREFERENCES.soundCues,
    });
  });
});
