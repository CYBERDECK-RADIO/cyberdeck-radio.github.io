// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import SkinToggle from "./SkinToggle";

afterEach(cleanup);

function renderToggle(skin: "winamp" | "jetaudio" = "winamp") {
  const onChange = vi.fn();
  render(<SkinToggle skin={skin} onChange={onChange} />);
  return { onChange };
}

describe("SkinToggle", () => {
  it("renders both options in order", () => {
    renderToggle();

    const options = screen.getByTestId("skin-toggle").querySelectorAll(".skin-toggle__option");
    expect(Array.from(options).map((option) => option.textContent)).toEqual(["Winamp", "JetAudio"]);
  });

  it("marks the active option aria-pressed true and the other false", () => {
    renderToggle("winamp");

    expect(screen.getByTestId("skin-option-winamp").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("skin-option-jetaudio").getAttribute("aria-pressed")).toBe("false");
  });

  it("marks the active option when JetAudio is selected", () => {
    renderToggle("jetaudio");

    expect(screen.getByTestId("skin-option-winamp").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("skin-option-jetaudio").getAttribute("aria-pressed")).toBe("true");
  });

  it("calls onChange with jetaudio when clicking JetAudio", () => {
    const { onChange } = renderToggle("winamp");

    fireEvent.click(screen.getByTestId("skin-option-jetaudio"));

    expect(onChange).toHaveBeenCalledWith("jetaudio");
  });

  it("calls onChange with winamp when clicking Winamp", () => {
    const { onChange } = renderToggle("jetaudio");

    fireEvent.click(screen.getByTestId("skin-option-winamp"));

    expect(onChange).toHaveBeenCalledWith("winamp");
  });
});
