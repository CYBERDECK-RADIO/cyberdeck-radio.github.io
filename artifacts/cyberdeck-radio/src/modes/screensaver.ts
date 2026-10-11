/**
 * Screen saver contract: when the atlas dozes off, and what wakes it.
 *
 *   stillness ──▶ IDLE_EVENTS reset a timer ──▶ idleMs elapses ──▶ engaged
 *   deliberate input ──▶ WAKE_EVENTS ──▶ released
 *
 * Waking is deliberate on purpose: pointer drift and scrolling do not kill the
 * saver, so it can sit ambiently while the room moves around it. Controls that
 * live *inside* the saver (play/pause) are exempt from waking it, marked with
 * `data-screensaver-control`, so the music can still be steered from across
 * the room.
 */

export const SCREENSAVER_IDLE_MS = 60_000;

/** Input that restarts the stillness countdown. */
export const IDLE_EVENTS = [
  "pointermove",
  "pointerdown",
  "keydown",
  "wheel",
  "touchstart",
] as const;

/** Input deliberate enough to bring the atlas back. */
export const WAKE_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

/** Attribute marking a control the saver must stay awake for. */
export const SCREENSAVER_CONTROL_ATTR = "data-screensaver-control";

/** True when the event came from a control inside the screen saver. */
export function isScreensaverControl(target: EventTarget | null): boolean {
  if (!target || typeof (target as Partial<Element>).closest !== "function") return false;
  return (target as Element).closest(`[${SCREENSAVER_CONTROL_ATTR}]`) !== null;
}
