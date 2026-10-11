// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import AtlasWorld from "./AtlasWorld";
import type Station from "../../stations/types";
import { stationFrequency } from "../../stations/frequency";

const stations: Station[] = [
  {
    id: "alpha",
    name: "Alpha Wave",
    country: "France",
    genres: ["world"],
    coordinates: [2.35, 48.85],
    streams: [{ url: "https://stream.example/alpha" }],
  },
  {
    id: "beta",
    name: "Beta Harbour",
    country: "Japan",
    genres: ["ambient"],
    coordinates: [139.69, 35.68],
    streams: [{ url: "https://stream.example/beta" }],
  },
  {
    id: "ghost",
    name: "Unmapped Ghost",
    genres: [],
    streams: [{ url: "https://stream.example/ghost" }],
  },
];

describe("AtlasWorld", () => {
  beforeEach(() => cleanup());

  it("plots only stations that carry usable coordinates", () => {
    render(
      <AtlasWorld stations={stations} selectedStationId={null} onSelectStation={() => {}} />,
    );

    const pips = document.querySelectorAll(".atlas-world__pip");
    expect(pips.length).toBe(2);
    expect(screen.queryByText("Unmapped Ghost")).toBeNull();
    expect(screen.getByText("Alpha Wave")).toBeTruthy();
  });

  it("locks and plays a station when its pip is chosen", () => {
    const onSelectStation = vi.fn();
    render(
      <AtlasWorld
        stations={stations}
        selectedStationId={null}
        onSelectStation={onSelectStation}
      />,
    );

    const pip = screen
      .getAllByRole("button", { name: /Play / })
      .find((node) => node.getAttribute("aria-label")?.includes("Beta Harbour"));
    expect(pip).toBeTruthy();
    fireEvent.click(pip!);
    expect(onSelectStation).toHaveBeenCalledWith("beta", { autoplay: true });
  });

  it("marks the locked station and announces its health class", () => {
    render(
      <AtlasWorld
        stations={stations}
        selectedStationId="alpha"
        healthById={new Map([["alpha", "live"]])}
        onSelectStation={() => {}}
      />,
    );

    const selected = document.querySelector(".atlas-world__pip.is-selected");
    expect(selected).toBeTruthy();
    expect(selected?.getAttribute("class")).toContain("health-live");
    expect(selected?.getAttribute("aria-label")).toContain("Alpha Wave");
  });

  it("responds to Enter on a pip like a click", () => {
    const onSelectStation = vi.fn();
    render(
      <AtlasWorld stations={stations} selectedStationId={null} onSelectStation={onSelectStation} />,
    );

    const pip = screen.getAllByRole("button", { name: /Play Alpha Wave/ })[0];
    fireEvent.keyDown(pip, { key: "Enter" });
    expect(onSelectStation).toHaveBeenCalledWith("alpha", { autoplay: true });
  });

  it("exposes keyboard pan/zoom on the map itself", () => {
    render(
      <AtlasWorld stations={stations} selectedStationId={null} onSelectStation={() => {}} />,
    );

    const svg = screen.getByRole("application");
    // At world zoom the map is clamped to its edges; zoom in first, then pan.
    fireEvent.keyDown(svg, { key: "+" });
    const zoomed = svg.querySelector(".atlas-world__world")?.getAttribute("transform");
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    const panned = svg.querySelector(".atlas-world__world")?.getAttribute("transform");
    expect(zoomed).toContain("scale(");
    expect(panned).not.toBe(zoomed);
  });

  it("collapses a dense city into one cluster and explains it under the cursor", () => {
    const dense = Array.from({ length: 40 }, (_, index) => ({
      id: `city-${index}`,
      name: `City Channel ${index}`,
      country: "France",
      coordinates: [2.35, 48.85 + index * 0.0005] as [number, number],
      streams: [{ url: `https://stream.example/${index}` }],
    }));
    const onSelectStation = vi.fn();
    render(
      <AtlasWorld stations={dense} selectedStationId={null} onSelectStation={onSelectStation} />,
    );

    const clusters = screen.getAllByRole("button", { name: /^Zoom to \d+ channels$/ });
    expect(clusters).toHaveLength(1);
    expect(clusters[0].getAttribute("aria-label")).toBe("Zoom to 40 channels");
    expect(clusters[0].textContent?.trim()).toBe("40");

    fireEvent.pointerEnter(clusters[0], { clientX: 40, clientY: 60 });
    const hint = document.querySelector(".atlas-world__hint");
    expect(hint?.textContent).toContain("40 channels");
    expect(hint?.textContent).toContain("France");
  });

  it("deep-dives a spread cluster until its channels separate", async () => {
    // Four channels a few degrees apart: one bubble at world zoom, four pips
    // once the deep dive finds the scale that clears them.
    const regional = [5.04, 7.56, 10.08, 12.6].map((longitude, index) => ({
      id: `leg-${index}`,
      name: `Leg ${index}`,
      country: "France",
      coordinates: [longitude, 0] as [number, number],
      streams: [{ url: `https://stream.example/${index}` }],
    }));
    render(<AtlasWorld stations={regional} selectedStationId={null} onSelectStation={() => {}} />);

    const worldTransform = () =>
      document.querySelector(".atlas-world__world")?.getAttribute("transform") ?? "";
    const before = worldTransform();

    fireEvent.click(screen.getByRole("button", { name: "Zoom to 4 channels" }));

    await waitFor(
      () => {
        const match = /scale\(([\d.]+)/.exec(worldTransform());
        expect(match).toBeTruthy();
        expect(Number(match?.[1])).toBeGreaterThan(1);
      },
      // The eased flight is rAF-driven; jsdom delivers its first frame late.
      { timeout: 4000 },
    );
    expect(worldTransform()).not.toBe(before);
    // The channels came apart on the map, so no picker was needed.
    expect(screen.queryByTestId("cluster-picker")).toBeNull();
  });

  it("hands a co-located crowd to the channel picker instead of zooming", () => {
    // The Radio Garden crawl pins every channel of a city to one point: no
    // zoom separates them, so the deep dive opens a dropdown to choose from.
    const city = Array.from({ length: 12 }, (_, index) => ({
      id: `stack-${index}`,
      name: `Stack Channel ${index}`,
      country: "France",
      city: "Paris",
      coordinates: [2.35, 48.85] as [number, number],
      streams: [{ url: `https://stream.example/${index}` }],
    }));
    const onSelectStation = vi.fn();
    render(
      <AtlasWorld stations={city} selectedStationId={null} onSelectStation={onSelectStation} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Zoom to 12 channels" }));

    const picker = screen.getByTestId("cluster-picker");
    expect(picker.getAttribute("aria-label")).toBe("12 channels · France");
    expect(screen.getByTestId("cluster-picker-title").textContent).toBe("12 channels · France");
    const rows = within(picker).getAllByRole("button", { name: /Stack Channel/ });
    expect(rows).toHaveLength(12);

    fireEvent.click(within(picker).getByTestId("button-cluster-pick-stack-3"));
    expect(onSelectStation).toHaveBeenCalledWith("stack-3", { autoplay: true });
    expect(screen.queryByTestId("cluster-picker")).toBeNull();
  });

  it("promises a picker, not a zoom, when a cluster cannot be split", () => {
    const city = Array.from({ length: 6 }, (_, index) => ({
      id: `same-${index}`,
      name: `Same Point ${index}`,
      country: "Japan",
      coordinates: [139.69, 35.68] as [number, number],
      streams: [{ url: `https://stream.example/${index}` }],
    }));
    render(<AtlasWorld stations={city} selectedStationId={null} onSelectStation={() => {}} />);

    const cluster = screen.getByRole("button", { name: "Zoom to 6 channels" });
    fireEvent.pointerEnter(cluster, { clientX: 40, clientY: 60 });
    const hint = document.querySelector(".atlas-world__hint");
    expect(hint?.textContent).toContain("6 channels");
    expect(hint?.textContent).toContain("Japan · tap to choose");
  });
});

describe("station carriers", () => {
  it("gives the fixture stations distinct dial positions", () => {
    expect(stationFrequency("alpha")).not.toBe(stationFrequency("beta"));
  });
});
