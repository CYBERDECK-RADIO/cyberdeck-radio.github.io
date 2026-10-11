// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import {
  isEditableTarget,
  isMapTarget,
  matchShortcut,
  ownsSpaceActivation,
} from "./shortcuts";

type KeyInit = Parameters<typeof matchShortcut>[0];

const key = (init: Partial<KeyInit> & { key: string }): KeyInit => init;

describe("matchShortcut", () => {
  it("maps the receiver's keys onto actions", () => {
    expect(matchShortcut(key({ key: " " }))).toBe("toggle-play");
    expect(matchShortcut(key({ key: "Spacebar" }))).toBe("toggle-play");
    expect(matchShortcut(key({ key: "p" }))).toBe("pin");
    expect(matchShortcut(key({ key: "P" }))).toBe("pin");
    expect(matchShortcut(key({ key: "m" }))).toBe("mute");
    expect(matchShortcut(key({ key: "ArrowLeft" }))).toBe("hop-prev");
    expect(matchShortcut(key({ key: "ArrowRight" }))).toBe("hop-next");
  });

  it("leaves every other key alone", () => {
    expect(matchShortcut(key({ key: "q" }))).toBeNull();
    expect(matchShortcut(key({ key: "Enter" }))).toBeNull();
    expect(matchShortcut(key({ key: "Escape" }))).toBeNull();
    expect(matchShortcut(key({ key: "ArrowUp" }))).toBeNull();
    // "/" and ⌘K belong to the search control, not the receiver.
    expect(matchShortcut(key({ key: "/" }))).toBeNull();
  });

  it("never claims a chord the browser owns", () => {
    expect(matchShortcut(key({ key: " ", ctrlKey: true }))).toBeNull();
    expect(matchShortcut(key({ key: "p", metaKey: true }))).toBeNull();
    expect(matchShortcut(key({ key: "m", altKey: true }))).toBeNull();
  });
});

/**
 * The DOM guards live beside the matcher because the shell has to ask them of
 * the real event target: an editable field keeps `/`, and the map keeps its
 * arrow keys.
 */
describe("shortcut target guards", () => {
  function element(html: string): HTMLElement {
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.append(container);
    return container.firstElementChild as HTMLElement;
  }

  it("spots editable fields so typing never triggers a shortcut", () => {
    const input = element('<input type="search" />');
    const select = element("<select></select>");
    const editable = element('<div contenteditable="true"></div>');
    const plain = element("<p>hello</p>");

    expect(isEditableTarget(input)).toBe(true);
    expect(isEditableTarget(select)).toBe(true);
    expect(isEditableTarget(editable)).toBe(true);
    expect(isEditableTarget(plain)).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
    document.body.replaceChildren();
  });

  it("lets a focused control keep its own Space activation", () => {
    const button = element("<button>Play</button>");
    const link = element('<a href="#player">Skip</a>');
    const text = element("<span>Not a control</span>");

    expect(ownsSpaceActivation(button)).toBe(true);
    expect(ownsSpaceActivation(link)).toBe(true);
    expect(ownsSpaceActivation(text)).toBe(false);
    document.body.replaceChildren();
  });

  it("spares the map's arrow panning", () => {
    const world = element('<div class="atlas-world"><svg tabindex="0"></svg></div>');
    const svg = world.querySelector("svg");
    const elsewhere = element("<main></main>");

    expect(isMapTarget(svg)).toBe(true);
    expect(isMapTarget(world)).toBe(true);
    expect(isMapTarget(elsewhere)).toBe(false);
    document.body.replaceChildren();
  });
});
