// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";

import { useSleepTimer } from "./use-sleep-timer";

describe("useSleepTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("starts off", () => {
    const { result } = renderHook(() => useSleepTimer());

    expect(result.current.armed).toBe(false);
    expect(result.current.remainingLabel).toBeNull();
    expect(result.current.remainingMs).toBe(0);
  });

  it("arms, ticks down, and fires the expiry exactly once", () => {
    const onExpire = vi.fn();
    const { result } = renderHook(() => useSleepTimer({ onExpire }));

    act(() => result.current.arm(15));
    expect(result.current.armed).toBe(true);
    expect(result.current.remainingLabel).toBe("15:00");

    act(() => vi.advanceTimersByTime(59_000));
    expect(result.current.remainingLabel).toBe("14:01");

    act(() => vi.advanceTimersByTime(842_000));
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(result.current.armed).toBe(false);
    expect(result.current.remainingLabel).toBeNull();

    act(() => vi.advanceTimersByTime(60_000));
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("re-arms over an existing countdown", () => {
    const onExpire = vi.fn();
    const { result } = renderHook(() => useSleepTimer({ onExpire }));

    act(() => result.current.arm(15));
    act(() => vi.advanceTimersByTime(10_000));
    act(() => result.current.arm(30));

    expect(result.current.remainingLabel).toBe("30:00");
    act(() => vi.advanceTimersByTime(15 * 60_000));
    expect(onExpire).not.toHaveBeenCalled();
  });

  it("cancels the countdown without firing", () => {
    const onExpire = vi.fn();
    const { result } = renderHook(() => useSleepTimer({ onExpire }));

    act(() => result.current.arm(30));
    act(() => vi.advanceTimersByTime(10_000));
    act(() => result.current.cancel());

    expect(result.current.armed).toBe(false);
    act(() => vi.advanceTimersByTime(60 * 60_000));
    expect(onExpire).not.toHaveBeenCalled();
  });

  it("uses the latest expiry handler after a re-render", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(
      ({ onExpire }: { onExpire: () => void }) => useSleepTimer({ onExpire }),
      { initialProps: { onExpire: first } },
    );

    act(() => result.current.arm(15));
    rerender({ onExpire: second });
    act(() => vi.advanceTimersByTime(16 * 60_000));

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
