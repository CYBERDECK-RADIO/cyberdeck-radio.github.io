/**
 * Theme switcher: the runtime skin picker for the atlas.
 *
 *   trigger ──▶ anchored palette of every registered theme, grouped by family
 *   option  ──▶ onSelectTheme(id) ──▶ <html data-theme> swaps the token block
 *
 * Lives in the mode dock so it survives zen (which hides the header). The label
 * reads "Theme" (not the current theme's name) so the control is discoverable,
 * and each row previews the skin's actual station-pin glyph on its own ground
 * colour. The menu groups themes by family (Elements, Cartoon, Japan, China,
 * India), closes on Escape or an outside click, and returns focus on dismissal.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";

import {
  FAMILY_LABELS,
  THEMES,
  getThemeDefinition,
  type ThemeFamily,
  type ThemeId,
} from "@/preferences/themes";
import PipShape from "./theme/PipShape";

type ThemeSwitcherProps = {
  theme: ThemeId;
  onSelectTheme: (theme: ThemeId) => void;
};

/** The families in registry order, so the menu reads top-to-bottom as authored. */
function familyOrder(): ThemeFamily[] {
  const seen: ThemeFamily[] = [];
  for (const option of THEMES) {
    if (!seen.includes(option.family)) seen.push(option.family);
  }
  return seen;
}

export default function ThemeSwitcher({ theme, onSelectTheme }: ThemeSwitcherProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const current = getThemeDefinition(theme);
  const families = useMemo(familyOrder, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <div className="theme-switcher" ref={rootRef}>
      <button
        type="button"
        className={`mode-dock__button theme-switcher__trigger${open ? " is-active" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Theme: ${current.label}`}
        onClick={() => setOpen((value) => !value)}
        ref={triggerRef}
        data-testid="button-theme-switcher"
      >
        <span
          className="theme-switcher__chip"
          aria-hidden="true"
          style={{ background: current.swatch[0], color: current.swatch[2] }}
        >
          <svg viewBox="-7 -7 14 14">
            <PipShape shape={current.pip} />
          </svg>
        </span>
        <span>Theme</span>
      </button>

      {open && (
        <div
          className="theme-switcher__menu"
          role="listbox"
          aria-label="Themes"
          data-testid="theme-switcher-menu"
        >
          {families.map((family) => (
            <div key={family} role="presentation">
              <span className="theme-switcher__group">{FAMILY_LABELS[family]}</span>
              {THEMES.filter((option) => option.family === family).map((option) => {
                const selected = option.id === theme;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={`theme-switcher__option${selected ? " is-active" : ""}`}
                    onClick={() => {
                      onSelectTheme(option.id);
                      setOpen(false);
                      triggerRef.current?.focus();
                    }}
                    data-testid={`button-theme-${option.id}`}
                  >
                    <span
                      className="theme-switcher__chip"
                      aria-hidden="true"
                      style={{ background: option.swatch[0], color: option.swatch[2] }}
                    >
                      <svg viewBox="-7 -7 14 14">
                        <PipShape shape={option.pip} />
                      </svg>
                    </span>
                    <span className="theme-switcher__option-copy">
                      <span className="theme-switcher__option-label">{option.label}</span>
                      <span className="theme-switcher__option-blurb">{option.blurb}</span>
                    </span>
                    {selected && <Check className="theme-switcher__check" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
