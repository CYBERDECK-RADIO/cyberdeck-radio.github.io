/**
 * The sleep timer state machine: arm a deadline, tick it down, stop the audio.
 *
 *   arm(minutes) ──▶ endsAt ──▶ 1s ticks ──▶ remainingLabel
 *                     │
 *                     └── deadline passed ──▶ onExpire() ──▶ (player stops)
 *   cancel()    ──▶ cleared
 *
 * One effect owns the countdown so the deadline and the read-out can never
 * disagree; `onExpire` lives in a ref so a re-render never re-arms the timer.
 * Everything is session-only — see `sleep-timer.ts`.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { formatSleepRemaining, sleepDeadline } from "./sleep-timer";

export type SleepTimerOptions = {
  /** Fired once when the deadline passes (stop the player, go quiet). */
  onExpire?: () => void;
};

export type SleepTimerState = {
  armed: boolean;
  remainingMs: number;
  /** "29:59" while armed, null when the timer is off. */
  remainingLabel: string | null;
  arm: (minutes: number) => void;
  cancel: () => void;
};

const TICK_MS = 1_000;

export function useSleepTimer({ onExpire }: SleepTimerOptions = {}): SleepTimerState {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  const arm = useCallback((minutes: number) => {
    setEndsAt(sleepDeadline(minutes));
    setRemainingMs(Math.max(0, minutes) * 60_000);
  }, []);

  const cancel = useCallback(() => {
    setEndsAt(null);
    setRemainingMs(0);
  }, []);

  useEffect(() => {
    if (endsAt === null) return;
    // One shot: several ticks can land in a single frame before React flushes
    // the state change that tears this interval down.
    let expired = false;
    const tick = () => {
      if (expired) return;
      const left = endsAt - Date.now();
      if (left <= 0) {
        expired = true;
        setEndsAt(null);
        setRemainingMs(0);
        onExpireRef.current?.();
        return;
      }
      setRemainingMs(left);
    };
    const interval = window.setInterval(tick, TICK_MS);
    return () => {
      expired = true;
      window.clearInterval(interval);
    };
  }, [endsAt]);

  return {
    armed: endsAt !== null,
    remainingMs,
    remainingLabel: endsAt !== null ? formatSleepRemaining(remainingMs) : null,
    arm,
    cancel,
  };
}
