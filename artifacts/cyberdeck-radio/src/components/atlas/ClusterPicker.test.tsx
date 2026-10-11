// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import ClusterPicker from "./ClusterPicker";
import type Station from "../../stations/types";

function crowd(count: number): Station[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `stack-${index}`,
    name: `Stack Channel ${index}`,
    country: "France",
    city: "Paris",
    coordinates: [2.35, 48.85] as [number, number],
    genres: [],
    streams: [{ url: `https://stream.example/${index}` }],
  }));
}

function renderPicker(overrides: Partial<Parameters<typeof ClusterPicker>[0]> = {}) {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <ClusterPicker
      stations={crowd(5)}
      title="5 channels · France"
      left={40}
      top={60}
      onSelect={onSelect}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { ...utils, onSelect, onClose };
}

describe("ClusterPicker", () => {
  beforeEach(() => cleanup());

  it("lists a small crowd without a filter box", () => {
    const { onSelect } = renderPicker();

    const panel = screen.getByTestId("cluster-picker");
    expect(panel.getAttribute("aria-label")).toBe("5 channels · France");
    expect(within(panel).getAllByRole("button", { name: /Stack Channel/ })).toHaveLength(5);
    expect(screen.queryByTestId("input-cluster-filter")).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("tunes the channel a row stands for and dismisses", () => {
    const { onSelect } = renderPicker();

    fireEvent.click(screen.getByTestId("button-cluster-pick-stack-3"));
    expect(onSelect).toHaveBeenCalledWith("stack-3", { autoplay: true });
  });

  it("offers a filter once the crowd is worth narrowing", () => {
    renderPicker({ stations: crowd(12) });

    expect(screen.getByTestId("input-cluster-filter")).toBeTruthy();
    fireEvent.change(screen.getByTestId("input-cluster-filter"), {
      target: { value: "channel 1" },
    });

    const rows = screen.getAllByRole("button", { name: /Stack Channel/ });
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.getAttribute("aria-label"))).toEqual([
      "Stack Channel 1, Paris · France",
      "Stack Channel 10, Paris · France",
      "Stack Channel 11, Paris · France",
    ]);
  });

  it("says so when the filter matches nothing", () => {
    renderPicker({ stations: crowd(12) });

    fireEvent.change(screen.getByTestId("input-cluster-filter"), {
      target: { value: "not-a-channel" },
    });
    expect(screen.getByTestId("cluster-picker-empty").textContent).toContain("not-a-channel");
  });

  it("pages a deep crowd instead of painting every row", () => {
    renderPicker({ stations: crowd(90) });

    expect(screen.getAllByRole("button", { name: /Stack Channel/ })).toHaveLength(40);
    const more = screen.getByTestId("button-cluster-picker-more");
    expect(more.textContent).toContain("Show 40 more of 50 left");

    fireEvent.click(more);
    expect(screen.getAllByRole("button", { name: /Stack Channel/ })).toHaveLength(80);
  });

  it("walks the rows with the arrow keys", () => {
    renderPicker();

    const rows = screen.getAllByRole("button", { name: /Stack Channel/ });
    expect(document.activeElement).toBe(rows[0]);

    fireEvent.keyDown(screen.getByTestId("cluster-picker"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(rows[1]);

    fireEvent.keyDown(screen.getByTestId("cluster-picker"), { key: "ArrowUp" });
    expect(document.activeElement).toBe(rows[0]);
  });

  it("closes on Escape and on map clicks outside", () => {
    const { onClose } = renderPicker();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.pointerDown(screen.getByTestId("cluster-picker"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("hands focus back to the bubble that opened it", () => {
    const bubble = document.createElement("button");
    document.body.appendChild(bubble);
    const { unmount } = renderPicker({
      returnFocusRef: { current: bubble as unknown as SVGGElement },
    });

    unmount();
    expect(document.activeElement).toBe(bubble);
  });
});
