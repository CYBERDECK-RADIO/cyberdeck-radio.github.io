// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_SKIN, SKIN_STORAGE_KEY } from "./skin";
import { useSkin } from "./use-skin";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-skin");
});

describe("useSkin", () => {
  it("uses the default skin with empty storage", () => {
    const { result } = renderHook(() => useSkin());
    expect(result.current.skin).toBe(DEFAULT_SKIN);
    expect(document.documentElement.dataset.skin).toBe("winamp");
  });

  it("initializes from stored skin", () => {
    window.localStorage.setItem(SKIN_STORAGE_KEY, "jetaudio");
    const { result } = renderHook(() => useSkin());
    expect(result.current.skin).toBe("jetaudio");
    expect(document.documentElement.dataset.skin).toBe("jetaudio");
  });

  it("falls back for an invalid stored value", () => {
    window.localStorage.setItem(SKIN_STORAGE_KEY, "spotify");
    const { result } = renderHook(() => useSkin());
    expect(result.current.skin).toBe(DEFAULT_SKIN);
  });

  it("toggles the skin, persists it and updates the document", () => {
    const { result } = renderHook(() => useSkin());
    act(() => {
      result.current.toggleSkin();
    });
    expect(result.current.skin).toBe("jetaudio");
    expect(window.localStorage.getItem(SKIN_STORAGE_KEY)).toBe("jetaudio");
    expect(document.documentElement.dataset.skin).toBe("jetaudio");
  });

  it("sets a specific skin, persists it and updates the document", () => {
    const { result } = renderHook(() => useSkin());
    act(() => {
      result.current.setSkin("jetaudio");
    });
    expect(result.current.skin).toBe("jetaudio");
    expect(window.localStorage.getItem(SKIN_STORAGE_KEY)).toBe("jetaudio");
    expect(document.documentElement.dataset.skin).toBe("jetaudio");
  });
});
