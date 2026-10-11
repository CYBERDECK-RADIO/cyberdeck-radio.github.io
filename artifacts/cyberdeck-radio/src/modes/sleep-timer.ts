/**
 * Sleep timer contract: how long the dial stays on before the room goes quiet.
 *
 *   minutes ──▶ useSleepTimer.arm ──▶ countdown ──▶ onExpire (player stop)
 *
 * The durations are the ones a bedside radio actually offers, and the read-out
 * is a plain `MM:SS` (or `H:MM:SS`) so the dossier can show exactly how much
 * listening is left. Timers are session-only on purpose: a countdown that
 * outlives a reload would stop a stream nobody meant to arm.
 */

export const SLEEP_TIMER_MINUTES = [15, 30, 45, 60] as const;

export type SleepTimerMinutes = (typeof SLEEP_TIMER_MINUTES)[number];

export function isSleepTimerMinutes(value: unknown): value is SleepTimerMinutes {
  return (
    typeof value === "number" && (SLEEP_TIMER_MINUTES as readonly number[]).includes(value)
  );
}

const MINUTE_MS = 60_000;

/** "29:59" (or "1:00:00" past the hour) — never a negative read-out. */
export function formatSleepRemaining(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}

/** Deadlines are always derived, never stored, so a clock jump can't arm one. */
export function sleepDeadline(minutes: number, now = Date.now()): number {
  return now + Math.max(0, minutes) * MINUTE_MS;
}
