/**
 * The one UTC clock face.
 *
 *   Date ──▶ formatUtcClock ──▶ "14:09:03"
 *
 * Shared by the header read-out and the screen saver so both always render the
 * same zero-padded, always-UTC timestamp.
 */

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatUtcClock(date: Date): string {
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}
