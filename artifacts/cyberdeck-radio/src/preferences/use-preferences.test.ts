// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_PREFERENCES, PREFERENCES_STORAGE_KEY } from "./preferences";
import { THEME_ATTRIBUTE } from "./themes";
import { usePreferences } from "./use-preferences";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.removeAttribute(THEME_ATTRIBUTE);
});

describe("usePreferences", () => {
  it("uses defaults with empty storage", () => {
    const { result } = renderHook(() => usePreferences());
    expect(result.current.volume).toBe(DEFAULT_PREFERENCES.volume);
    expect(result.current.visualizerStyle).toBe(DEFAULT_PREFERENCES.visualizerStyle);
  });

  it("initializes from stored preferences", () => {
    window.localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({ volume: 0.2, visualizerStyle: "vu" }),
    );
    const { result } = renderHook(() => usePreferences());
    expect(result.current.volume).toBeCloseTo(0.2);
    expect(result.current.visualizerStyle).toBe("vu");
  });

  it("falls back for malformed stored JSON", () => {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, "{not json");
    const { result } = renderHook(() => usePreferences());
    expect(result.current.volume).toBe(DEFAULT_PREFERENCES.volume);
  });

  it("persists volume changes and clamps them", () => {
    const { result } = renderHook(() => usePreferences());
    act(() => {
      result.current.setVolume(2);
    });
    expect(result.current.volume).toBe(1);
    expect(JSON.parse(window.localStorage.getItem(PREFERENCES_STORAGE_KEY) ?? "{}").volume).toBe(1);
  });

  it("cycles and persists the visualizer style", () => {
    const { result } = renderHook(() => usePreferences());
    act(() => {
      result.current.cycleVisualizerStyle();
    });
    expect(result.current.visualizerStyle).toBe("vu");
    expect(
      JSON.parse(window.localStorage.getItem(PREFERENCES_STORAGE_KEY) ?? "{}").visualizerStyle,
    ).toBe("vu");
  });

  it("applies and persists the saved theme on mount", () => {
    window.localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({ theme: "air", volume: 0.5, visualizerStyle: "spectrum" }),
    );
    const { result } = renderHook(() => usePreferences());
    expect(result.current.theme).toBe("air");
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe("air");
  });

  it("swaps the document theme and persists the choice", () => {
    const { result } = renderHook(() => usePreferences());
    expect(result.current.theme).toBe(DEFAULT_PREFERENCES.theme);

    act(() => {
      result.current.setTheme("fire");
    });
    expect(result.current.theme).toBe("fire");
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe("fire");
    expect(
      JSON.parse(window.localStorage.getItem(PREFERENCES_STORAGE_KEY) ?? "{}").theme,
    ).toBe("fire");
  });
});
