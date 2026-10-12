/**
 * useThemeCues — wires the active skin's interface voice to real interactions.
 *
 *   theme change ──▶ "theme" cue (skipped on first paint)
 *   pointerdown on a control ──▶ "select" cue
 *   returned play(cue) ──▶ callers voice their own moments ("wake", "tap")
 *
 * A single delegated listener on `document` (capture phase) voices any control
 * the user touches, so no individual button has to opt in. The WebAudio engine
 * is created after mount and only makes sound once the user interacts, so
 * autoplay policy is satisfied. When `enabled` is false the engine stays silent
 * and no listener is attached.
 */

import { useCallback, useEffect, useRef } from "react";

import { createUiSound, type UiCue, type UiSound } from "@/audio/ui-sound";
import { getThemeDefinition, type ThemeId } from "./themes";

/** Anything that reads as a tappable control in the dock, deck, or drawer. */
const CUE_TARGET =
  "button, [role='option'], [role='menuitemradio'], [role='menuitem'], select, input[type='range']";

export function useThemeCues(theme: ThemeId, enabled: boolean): (cue: UiCue) => void {
  const soundRef = useRef<UiSound | null>(null);
  const profileRef = useRef(getThemeDefinition(theme).sound);
  const previousThemeRef = useRef<ThemeId | null>(null);
  profileRef.current = getThemeDefinition(theme).sound;

  useEffect(() => {
    soundRef.current = createUiSound();
    return () => {
      soundRef.current?.dispose();
      soundRef.current = null;
    };
  }, []);

  // Voice the moment the skin changes — but never on first paint.
  useEffect(() => {
    if (previousThemeRef.current === null) {
      previousThemeRef.current = theme;
      return;
    }
    if (previousThemeRef.current === theme) return;
    previousThemeRef.current = theme;
    if (enabled) soundRef.current?.play("theme", profileRef.current);
  }, [theme, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest?.(CUE_TARGET)) return;
      soundRef.current?.play("select", profileRef.current);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [enabled]);

  return useCallback((cue: UiCue) => {
    soundRef.current?.play(cue, profileRef.current);
  }, []);
}
