// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ThemeSwitcher from "./ThemeSwitcher";

afterEach(cleanup);

describe("ThemeSwitcher", () => {
  it("labels the trigger 'Theme' and names the active skin accessibly", () => {
    render(<ThemeSwitcher theme="fire" onSelectTheme={() => {}} />);
    const trigger = screen.getByTestId("button-theme-switcher");
    expect(trigger.textContent).toContain("Theme");
    expect(trigger.getAttribute("aria-label")).toContain("Fire");
  });

  it("opens a listbox of every registered theme", () => {
    render(<ThemeSwitcher theme="signal" onSelectTheme={() => {}} />);
    expect(screen.queryByTestId("theme-switcher-menu")).toBeNull();

    fireEvent.click(screen.getByTestId("button-theme-switcher"));
    const menu = screen.getByTestId("theme-switcher-menu");
    expect(menu.getAttribute("role")).toBe("listbox");
    expect(screen.getByTestId("button-theme-water")).toBeTruthy();
    expect(screen.getByTestId("button-theme-bubblegum")).toBeTruthy();
    expect(screen.getByTestId("button-theme-tamil")).toBeTruthy();
  });

  it("reports the chosen theme and closes", () => {
    const onSelectTheme = vi.fn();
    render(<ThemeSwitcher theme="signal" onSelectTheme={onSelectTheme} />);

    fireEvent.click(screen.getByTestId("button-theme-switcher"));
    fireEvent.click(screen.getByTestId("button-theme-jade"));

    expect(onSelectTheme).toHaveBeenCalledWith("jade");
    expect(screen.queryByTestId("theme-switcher-menu")).toBeNull();
  });

  it("closes on Escape and returns focus to the trigger", () => {
    render(<ThemeSwitcher theme="signal" onSelectTheme={() => {}} />);
    const trigger = screen.getByTestId("button-theme-switcher");
    fireEvent.click(trigger);
    expect(screen.getByTestId("theme-switcher-menu")).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("theme-switcher-menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
