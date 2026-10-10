import { useEffect, useState } from "react";

import {
  DEFAULT_SKIN,
  SKIN_STORAGE_KEY,
  isSkin,
  nextSkin,
  type Skin,
} from "./skin";

function readSkin(): Skin {
  if (typeof window === "undefined") {
    return DEFAULT_SKIN;
  }
  try {
    const stored = window.localStorage.getItem(SKIN_STORAGE_KEY);
    return isSkin(stored) ? stored : DEFAULT_SKIN;
  } catch {
    return DEFAULT_SKIN;
  }
}

export function useSkin(): {
  skin: Skin;
  setSkin: (skin: Skin) => void;
  toggleSkin: () => void;
} {
  const [skin, setSkin] = useState<Skin>(readSkin);

  useEffect(() => {
    document.documentElement.dataset.skin = skin;
    try {
      window.localStorage.setItem(SKIN_STORAGE_KEY, skin);
    } catch {
      return;
    }
  }, [skin]);

  return {
    skin,
    setSkin,
    toggleSkin: () => setSkin((current) => nextSkin(current)),
  };
}
