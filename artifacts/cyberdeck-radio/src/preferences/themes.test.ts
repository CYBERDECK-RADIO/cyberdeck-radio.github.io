// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_THEME_ID,
  THEMES,
  THEME_ATTRIBUTE,
  THEME_SOUNDS,
  applyThemeToDocument,
  getThemeDefinition,
  isThemeId,
  nextThemeId,
} from "./themes";

const CUES = ["blip", "boing", "woodblock", "gong", "membrane"] as const;

afterEach(() => {
  document.documentElement.removeAttribute(THEME_ATTRIBUTE);
});

describe("isThemeId", () => {
  it("accepts every registered theme and nothing else", () => {
    for (const theme of THEMES) expect(isThemeId(theme.id)).toBe(true);
    expect(isThemeId("neon")).toBe(false);
    expect(isThemeId(undefined)).toBe(false);
    expect(isThemeId(42)).toBe(false);
  });
});

describe("getThemeDefinition", () => {
  it("returns the matching definition", () => {
    expect(getThemeDefinition("fire").label).toBe("Fire");
  });

  it("gives every theme a pin glyph, a backdrop art, and a shader profile", () => {
    for (const theme of THEMES) {
      expect(theme.pip).toBeTruthy();
      expect(theme.art).toBeTruthy();
      expect(theme.shader.speed).toBeGreaterThan(0);
      expect(theme.swatch).toHaveLength(3);
    }
  });
});

describe("sound profiles", () => {
  it("gives every theme a defined profile with sane numbers", () => {
    for (const theme of THEMES) {
      const sound = THEME_SOUNDS[theme.id];
      expect(sound).toBeDefined();
      expect(CUES).toContain(sound.cue);
      expect(sound.pitch).toBeGreaterThan(0);
      expect(sound.decay).toBeGreaterThan(0);
      expect(sound.gain).toBeGreaterThan(0);
      expect(sound.gain).toBeLessThanOrEqual(1);
    }
  });

  it("joins the same profile into every theme definition", () => {
    for (const theme of THEMES) {
      expect(getThemeDefinition(theme.id).sound).toEqual(THEME_SOUNDS[theme.id]);
    }
  });
});

describe("nextThemeId", () => {
  it("cycles through the registry and wraps", () => {
    const first = THEMES[0]!.id;
    expect(nextThemeId(THEMES[THEMES.length - 1]!.id)).toBe(first);
    expect(nextThemeId(DEFAULT_THEME_ID)).toBe(THEMES[1]!.id);
  });
});

describe("applyThemeToDocument", () => {
  it("writes the token-block attribute onto the document element", () => {
    applyThemeToDocument("air");
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe("air");
  });
});
