// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import ShaderBackdrop, {
  buildBackdropPalette,
  supportsWebGL2,
} from "./ShaderBackdrop";

// Keep the mount test hermetic: Paper's ShaderMount would try to drive a real
// WebGL2 context inside an async effect, which jsdom cannot provide.
vi.mock("@paper-design/shaders-react", () => ({
  MeshGradient: () => <div data-testid="mesh-gradient" />,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("supportsWebGL2", () => {
  it("is false in jsdom (no WebGL)", () => {
    expect(supportsWebGL2()).toBe(false);
  });

  it("is true when the canvas yields a webgl2 context", () => {
    const fakeGl = {};
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      fakeGl as unknown as RenderingContext,
    );
    expect(supportsWebGL2()).toBe(true);
  });
});

describe("buildBackdropPalette", () => {
  it("falls back to the amber token mirrors when CSS vars are absent", () => {
    expect(buildBackdropPalette()).toEqual([
      "#0b0d11",
      "#12161f",
      "#141822",
      "#d4984f",
    ]);
  });

  it("prefers live CSS custom properties when present", () => {
    document.documentElement.style.setProperty("--accent", "rgb(1, 2, 3)");
    expect(buildBackdropPalette()[3]).toBe("rgb(1, 2, 3)");
  });
});

describe("ShaderBackdrop", () => {
  it("renders nothing without WebGL2 so the CSS background stands alone", () => {
    const { container } = render(<ShaderBackdrop />);
    expect(
      container.querySelector('[data-testid="shader-backdrop"]'),
    ).toBeNull();
  });

  it("mounts an aria-hidden backdrop layer when WebGL2 is available", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as unknown as RenderingContext,
    );
    render(<ShaderBackdrop />);
    const backdrop = screen.getByTestId("shader-backdrop");
    expect(backdrop.getAttribute("aria-hidden")).toBe("true");
  });
});
