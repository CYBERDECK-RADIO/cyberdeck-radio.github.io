// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SCREENSAVER_CONTROL_ATTR } from "./screensaver";
import { useScreensaver } from "./use-screensaver";

const IDLE_MS = 1_000;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function fire(type: string, target: EventTarget = window) {
  act(() => {
    target.dispatchEvent(new Event(type, { bubbles: true }));
  });
}

describe("useScreensaver", () => {
  it("dozes off once the stillness window elapses", () => {
    const { result } = renderHook(() => useScreensaver({ idleMs: IDLE_MS }));

    expect(result.current.engaged).toBe(false);
    advance(IDLE_MS);
    expect(result.current.engaged).toBe(true);
  });

  it("keeps counting through pointer drift", () => {
    const { result } = renderHook(() => useScreensaver({ idleMs: IDLE_MS }));

    advance(IDLE_MS - 1);
    fire("pointermove");
    advance(IDLE_MS - 1);
    expect(result.current.engaged).toBe(false);

    advance(1);
    expect(result.current.engaged).toBe(true);
  });

  it("wakes on deliberate input and starts a fresh countdown", () => {
    const { result } = renderHook(() => useScreensaver({ idleMs: IDLE_MS }));

    advance(IDLE_MS);
    expect(result.current.engaged).toBe(true);

    fire("keydown");
    expect(result.current.engaged).toBe(false);

    advance(IDLE_MS - 1);
    expect(result.current.engaged).toBe(false);
    advance(1);
    expect(result.current.engaged).toBe(true);
  });

  it("treats pointer drift as stillness rather than a wake-up", () => {
    const { result } = renderHook(() => useScreensaver({ idleMs: IDLE_MS }));

    advance(IDLE_MS);
    fire("pointermove");
    expect(result.current.engaged).toBe(true);
  });

  it("gates auto-engagement but never the wake-up", () => {
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useScreensaver({ idleMs: IDLE_MS, enabled }),
      { initialProps: { enabled: false } },
    );

    advance(IDLE_MS);
    expect(result.current.engaged).toBe(false);

    act(() => {
      result.current.engage();
    });
    expect(result.current.engaged).toBe(true);

    fire("pointerdown");
    expect(result.current.engaged).toBe(false);

    rerender({ enabled: true });
    advance(IDLE_MS);
    expect(result.current.engaged).toBe(true);
  });

  it("leaves the saver running when its own controls are used", () => {
    const { result } = renderHook(() => useScreensaver({ idleMs: IDLE_MS }));
    const control = document.createElement("button");
    control.setAttribute(SCREENSAVER_CONTROL_ATTR, "");
    document.body.append(control);

    advance(IDLE_MS);
    expect(result.current.engaged).toBe(true);

    fire("pointerdown", control);
    expect(result.current.engaged).toBe(true);

    control.remove();
    fire("pointerdown");
    expect(result.current.engaged).toBe(false);
  });

  it("offers explicit engage and release for buttons", () => {
    const { result } = renderHook(() => useScreensaver({ idleMs: IDLE_MS }));

    act(() => {
      result.current.engage();
    });
    expect(result.current.engaged).toBe(true);

    act(() => {
      result.current.release();
    });
    expect(result.current.engaged).toBe(false);
    advance(IDLE_MS);
    expect(result.current.engaged).toBe(true);
  });
});
