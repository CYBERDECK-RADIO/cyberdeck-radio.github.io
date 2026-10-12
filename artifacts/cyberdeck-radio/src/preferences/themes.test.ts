// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_THEME_ID,
  THEMES,
  THEME_ATTRIBUTE,
  applyThemeToDocument,
  getThemeDefinition,
  isThemeId,
  nextThemeId,
} from "./themes";

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
