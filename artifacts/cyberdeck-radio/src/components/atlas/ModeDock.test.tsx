// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ModeDock from "./ModeDock";

afterEach(cleanup);

describe("ModeDock", () => {
  it("answers the zen toggle with press-state semantics", () => {
    const onToggleZen = vi.fn();
    const { rerender } = render(
      <ModeDock
        zen={false}
        onToggleZen={onToggleZen}
        onStartScreensaver={() => {}}
        theme="signal"
        onSelectTheme={() => {}}
      />,
    );

    const toggle = screen.getByTestId("button-toggle-zen");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(toggle.textContent).toContain("Zen");

    fireEvent.click(toggle);
    expect(onToggleZen).toHaveBeenCalledTimes(1);

    rerender(
      <ModeDock
        zen
        onToggleZen={onToggleZen}
        onStartScreensaver={() => {}}
        theme="signal"
        onSelectTheme={() => {}}
      />,
    );
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(toggle.textContent).toContain("Exit zen");
  });

  it("starts the screen saver on demand", () => {
    const onStartScreensaver = vi.fn();
    render(
      <ModeDock
        zen={false}
        onToggleZen={() => {}}
        onStartScreensaver={onStartScreensaver}
        theme="signal"
        onSelectTheme={() => {}}
      />,
    );

    fireEvent.click(screen.getByTestId("button-start-screensaver"));
    expect(onStartScreensaver).toHaveBeenCalledTimes(1);
  });

  it("surfaces the theme switcher in the dock", () => {
    const onSelectTheme = vi.fn();
    render(
      <ModeDock
        zen={false}
        onToggleZen={() => {}}
        onStartScreensaver={() => {}}
        theme="water"
        onSelectTheme={onSelectTheme}
      />,
    );

    fireEvent.click(screen.getByTestId("button-theme-switcher"));
    fireEvent.click(screen.getByTestId("button-theme-fire"));
    expect(onSelectTheme).toHaveBeenCalledWith("fire");
  });
});
