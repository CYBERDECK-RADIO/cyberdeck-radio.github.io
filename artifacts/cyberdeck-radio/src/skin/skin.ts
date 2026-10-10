export type Skin = "winamp" | "jetaudio";

export const DEFAULT_SKIN: Skin = "winamp";

export const SKIN_STORAGE_KEY = "cyberdeck-radio:skin";

export function isSkin(value: unknown): value is Skin {
  return value === "winamp" || value === "jetaudio";
}

export function nextSkin(skin: Skin): Skin {
  return skin === "winamp" ? "jetaudio" : "winamp";
}
