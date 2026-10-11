/**
 * The screen saver state machine: doze off on stillness, wake on intent.
 *
 *   IDLE_EVENTS ──▶ arm(idleMs) ──▶ engaged ──▶ WAKE_EVENTS ──▶ released
 *                        ▲                              │
 *                        └───── deliberate input re-arms ┘
 *
 *   enabled:false ──▶ auto-engagement gated (still wakes on input)
 *
 * The timer lives in one effect so listeners and the countdown always agree;
 * `engage`/`release` are plain state setters for buttons, while every input
 * event re-arms the countdown itself. Auto-engagement can be gated from the
 * outside (the directory drawer is open), but waking never is.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  IDLE_EVENTS,
  SCREENSAVER_IDLE_MS,
  WAKE_EVENTS,
  isScreensaverControl,
} from "./screensaver";

export type UseScreensaverOptions = {
  /** Stillness window before the saver engages on its own. */
  idleMs?: number;
  /** Gates auto-engagement only; waking stays live either way. */
  enabled?: boolean;
};

export type ScreensaverState = {
  engaged: boolean;
  engage: () => void;
  release: () => void;
};

export function useScreensaver({
  idleMs = SCREENSAVER_IDLE_MS,
  enabled = true,
}: UseScreensaverOptions = {}): ScreensaverState {
  const [engaged, setEngaged] = useState(false);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const arm = () => {
      clearTimer();
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        if (enabledRef.current) setEngaged(true);
      }, idleMs);
    };

    const onIdle = () => {
      if (enabledRef.current) arm();
      else clearTimer();
    };

    const onWake = (event: Event) => {
      // The saver's own transport keeps the room dark while it steers playback.
      if (isScreensaverControl(event.target)) return;
      setEngaged(false);
      arm();
    };

    IDLE_EVENTS.forEach((name) => window.addEventListener(name, onIdle, { passive: true }));
    WAKE_EVENTS.forEach((name) => window.addEventListener(name, onWake, { passive: true }));
    if (enabled) arm();
    else clearTimer();

    return () => {
      clearTimer();
      IDLE_EVENTS.forEach((name) => window.removeEventListener(name, onIdle));
      WAKE_EVENTS.forEach((name) => window.removeEventListener(name, onWake));
    };
  }, [enabled, idleMs]);

  const engage = useCallback(() => setEngaged(true), []);
  const release = useCallback(() => setEngaged(false), []);

  return { engaged, engage, release };
}
