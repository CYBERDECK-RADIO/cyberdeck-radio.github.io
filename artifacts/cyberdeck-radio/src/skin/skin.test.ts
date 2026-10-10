import { describe, expect, it } from "vitest";

import { DEFAULT_SKIN, isSkin, nextSkin } from "./skin";

describe("skin", () => {
  it("defaults to winamp", () => {
    expect(DEFAULT_SKIN).toBe("winamp");
  });

  it("accepts known skins", () => {
    expect(isSkin("winamp")).toBe(true);
    expect(isSkin("jetaudio")).toBe(true);
  });

  it("rejects unknown values", () => {
    expect(isSkin(undefined)).toBe(false);
    expect(isSkin(null)).toBe(false);
    expect(isSkin("")).toBe(false);
    expect(isSkin("Winamp")).toBe(false);
    expect(isSkin("spotify")).toBe(false);
  });

  it("returns the other skin", () => {
    expect(nextSkin("winamp")).toBe("jetaudio");
    expect(nextSkin("jetaudio")).toBe("winamp");
  });
});
