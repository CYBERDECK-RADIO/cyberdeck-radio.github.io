/**
 * The floating mode dock: the one place view modes are switched.
 *
 *   zen toggle ──▶ aria-pressed + label swap ──▶ onToggleZen
 *   screen saver ──▶ onStartScreensaver
 *
 * Sits at the top-left of the atlas canvas so it survives zen mode (which
 * hides the header) and disappears with the screen saver itself.
 */

import { Leaf, Moon } from "lucide-react";

type ModeDockProps = {
  zen: boolean;
  onToggleZen: () => void;
  onStartScreensaver: () => void;
};

export default function ModeDock({ zen, onToggleZen, onStartScreensaver }: ModeDockProps) {
  return (
    <div className="mode-dock" role="group" aria-label="View modes" data-testid="mode-dock">
      <button
        type="button"
        className={`mode-dock__button${zen ? " is-active" : ""}`}
        aria-pressed={zen}
        onClick={onToggleZen}
        data-testid="button-toggle-zen"
      >
        <Leaf aria-hidden="true" />
        <span>{zen ? "Exit zen" : "Zen"}</span>
      </button>
      <button
        type="button"
        className="mode-dock__button"
        onClick={onStartScreensaver}
        data-testid="button-start-screensaver"
      >
        <Moon aria-hidden="true" />
        <span>Screen saver</span>
      </button>
    </div>
  );
}
