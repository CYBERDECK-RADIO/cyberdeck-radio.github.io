/**
 * The clock faces.
 *
 *   Date ──▶ formatUtcClock ──▶ "14:09:03"      (header read-out, always UTC)
 *   Date ──▶ formatLocalClock ──▶ "09:09:03"    (screen saver, local time)
 *
 * Both zero-pad every field, so the read-outs stay aligned across the UI.
 */

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatUtcClock(date: Date): string {
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

export function formatLocalClock(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
