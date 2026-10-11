/**
 * Global keyboard shortcuts for the receiver.
 *
 *   keydown ──▶ matchShortcut ──▶ action ──▶ the shell performs it
 *
 * The matcher is deliberately DOM-free: it only turns a key into an intent, so
 * every rule about *when* an intent may fire (focused inputs, the map's own
 * arrow panning, a button about to handle its own Space) stays in the shell
 * where the elements actually live. Modifier chords belong to the browser, so
 * anything with Ctrl/Alt/Meta held is never ours. Focusing the search field
 * ("/" and ⌘K) belongs to the search control itself, not here.
 */

export type ShortcutAction =
  | "toggle-play"
  | "pin"
  | "mute"
  | "hop-prev"
  | "hop-next";

type ShortcutEvent = {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
};

/** Keys that always mean the focused control, never the shell. */
const EDITABLE_SELECTOR = "input, textarea, select, [contenteditable]:not([contenteditable='false'])";

/** A focused control that owns Space/Enter should handle it itself. */
const ACTIVATABLE_SELECTOR = "button, a[href], [role='button'], [role='menuitem'], [role='tab'], summary";

export function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as Element | null;
  return Boolean(element && typeof element.closest === "function" && element.closest(EDITABLE_SELECTOR));
}

export function ownsSpaceActivation(target: EventTarget | null): boolean {
  const element = target as Element | null;
  return Boolean(element && typeof element.closest === "function" && element.closest(ACTIVATABLE_SELECTOR));
}

/** True while the event landed on the world map, which pans with the arrows. */
export function isMapTarget(target: EventTarget | null): boolean {
  const element = target as Element | null;
  return Boolean(element && typeof element.closest === "function" && element.closest(".atlas-world"));
}

export function matchShortcut(event: ShortcutEvent): ShortcutAction | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;

  switch (event.key) {
    case " ":
    case "Spacebar":
      return "toggle-play";
    case "p":
    case "P":
      return "pin";
    case "m":
    case "M":
      return "mute";
    case "ArrowLeft":
      return "hop-prev";
    case "ArrowRight":
      return "hop-next";
    default:
      return null;
  }
}
