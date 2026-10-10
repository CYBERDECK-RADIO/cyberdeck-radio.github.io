// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

import App from "./App";

const jsonResponse = (body: unknown, status = 200): Response =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

beforeEach(() => {
  // The atlas asks for trending signals on mount; tests that do not care about it
  // stay offline so the component falls back to its idle directory.
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline in tests")));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("App home view", () => {
  it("renders the search, deck, and results region", () => {
    render(<App />);

    expect(screen.getByTestId("input-station-search")).toBeTruthy();
    expect(screen.getByTestId("deck")).toBeTruthy();
    expect(screen.getByTestId("results-region")).toBeTruthy();
  });

  it("renders the world broadcast atlas map", () => {
    render(<App />);

    expect(screen.getByTestId("station-map")).toBeTruthy();
  });

  it("opens on a dead directory with an idle, usable search box", async () => {
    render(<App />);

    await waitFor(() =>
      expect(screen.getByTestId("state-search-idle")).toBeTruthy(),
    );
    expect(screen.getByTestId("button-search-stations")).toBeTruthy();
  });

  it("populates the directory with trending signals before any search", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse([
          {
            stationuuid: "trend-1",
            name: "Global Wave",
            url: "https://stream.example/wave",
            tags: "world, news",
            countrycode: "FR",
            country: "France",
            geo_lat: 48.85,
            geo_long: 2.35,
          },
          {
            stationuuid: "trend-2",
            name: "Night Harbour",
            url: "https://stream.example/harbour",
            tags: "ambient",
            countrycode: "JP",
            country: "Japan",
            geo_lat: 35.68,
            geo_long: 139.69,
          },
        ]),
      ),
    );

    render(<App />);

    await waitFor(() =>
      expect(screen.getByTestId("list-station-results")).toBeTruthy(),
    );

    expect(screen.getByTestId("text-station-name-trend-1")).toBeTruthy();
    expect(screen.getByTestId("text-station-name-trend-2")).toBeTruthy();
    expect(screen.getByTestId("text-result-count").textContent).toContain("2 SIGNALS");
    expect(screen.queryByTestId("state-search-idle")).toBeNull();
  });
});
