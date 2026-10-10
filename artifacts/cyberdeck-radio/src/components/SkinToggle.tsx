/**
 * Interface skin picker.
 *
 * Presentational only: it reflects the active skin and reports the chosen one.
 */

import type { Skin } from "@/skin/skin";

type SkinToggleProps = {
  skin: Skin;
  onChange: (skin: Skin) => void;
};

const SKINS: { value: Skin; label: string; testId: string }[] = [
  { value: "winamp", label: "Winamp", testId: "skin-option-winamp" },
  { value: "jetaudio", label: "JetAudio", testId: "skin-option-jetaudio" },
];

export default function SkinToggle({ skin, onChange }: SkinToggleProps) {
  return (
    <div
      className="skin-toggle"
      role="group"
      aria-label="Interface skin"
      data-testid="skin-toggle"
    >
      {SKINS.map((option) => {
        const isActive = option.value === skin;
        return (
          <button
            key={option.value}
            type="button"
            className={`skin-toggle__option${isActive ? " is-active" : ""}`}
            aria-pressed={isActive}
            data-testid={option.testId}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
