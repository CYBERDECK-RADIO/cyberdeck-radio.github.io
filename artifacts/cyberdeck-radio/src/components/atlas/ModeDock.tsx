/**
 * The floating mode dock: the one place view modes and the skin are switched.
 *
 *   zen toggle ──▶ aria-pressed + label swap ──▶ onToggleZen
 *   screen saver ──▶ onStartScreensaver
 *   sound ──▶ aria-pressed + Volume2/VolumeX swap ──▶ onToggleSoundCues
 *   theme ──▶ ThemeSwitcher ──▶ onSelectTheme
 *
 * Sits at the top-left of the atlas canvas so it survives zen mode (which
 * hides the header) and disappears with the screen saver itself. The sound
 * button renders only when the shell supplies `onToggleSoundCues`.
 */

import { Leaf, Moon, Volume2, VolumeX } from "lucide-react";

import ThemeSwitcher from "./ThemeSwitcher";
import type { ThemeId } from "@/preferences/themes";

type ModeDockProps = {
  zen: boolean;
  onToggleZen: () => void;
  onStartScreensaver: () => void;
  theme: ThemeId;
  onSelectTheme: (theme: ThemeId) => void;
  /** Whether the theme's interface cues are audible. */
  soundCues?: boolean;
  onToggleSoundCues?: () => void;
};

export default function ModeDock({
  zen,
  onToggleZen,
  onStartScreensaver,
  theme,
  onSelectTheme,
  soundCues = false,
  onToggleSoundCues,
}: ModeDockProps) {
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
      {onToggleSoundCues && (
        <button
          type="button"
          className={`mode-dock__button${soundCues ? " is-active" : ""}`}
          aria-pressed={soundCues}
          aria-label={soundCues ? "Mute interface sounds" : "Enable interface sounds"}
          title={soundCues ? "Interface sounds on" : "Interface sounds off"}
          onClick={onToggleSoundCues}
          data-testid="button-toggle-sound"
        >
          {soundCues ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
          <span>Sound</span>
        </button>
      )}
      <ThemeSwitcher theme={theme} onSelectTheme={onSelectTheme} />
    </div>
  );
}
