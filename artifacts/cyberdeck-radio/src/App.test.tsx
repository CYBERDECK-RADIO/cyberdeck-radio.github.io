// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import App from "./App";
import { SCREENSAVER_IDLE_MS } from "@/modes/screensaver";
import { resetPinnedChannels } from "@/stations/pinned-channels";
import { resetGardenStationsCache } from "@/stations/radio-garden";
import { recordChannel, resetRecentChannels } from "@/stations/recent-channels";
import { resetSomaChannelsCache } from "@/stations/somafm";

const jsonResponse = (body: unknown, status = 200): Response => {
  const text = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(text),
    arrayBuffer: async () => new TextEncoder().encode(text).buffer,
  } as unknown as Response;
};

type DirectoryRecord = {
  stationuuid: string;
  name: string;
  url: string;
  tags?: string;
  country?: string;
  countrycode?: string;
  state?: string;
  city?: string;
  geo_lat?: number;
  geo_long?: number;
};

/**
 * Answers every catalog shape the merged directory asks for — the baked Radio
 * Garden catalog object, an empty SomaFM lineup, and the Radio Browser search
 * array — so these tests hold the combined single-group read on the app.
 */
function stubDirectory(records: DirectoryRecord[]) {
  const gardenStations = records.map((record) => ({
    id: `garden:${record.stationuuid}`,
    name: record.name,
    country: record.country,
    countryCode: record.countrycode,
    state: record.state,
    city: record.city,
    genres: (record.tags ?? "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    streams: [{ url: record.url }],
    ...(record.geo_lat != null && record.geo_long != null
      ? { coordinates: [record.geo_long, record.geo_lat] }
      : {}),
  }));

  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((input: URL | string) => {
      const url = String(input);
      if (url.includes("radio-garden.json")) {
        return Promise.resolve(
          jsonResponse({
            generatedAt: "2026-10-11T00:00:00.000Z",
            source: "radio.garden",
            count: gardenStations.length,
            stations: gardenStations,
          }),
        );
      }
      if (url.includes("somafm.com/channels.json")) {
        return Promise.resolve(jsonResponse({ channels: [] }));
      }
      return Promise.resolve(jsonResponse(records));
    }),
  );
}

beforeEach(() => {
  // The atlas asks for trending signals on mount; tests that do not care about it
  // stay offline so the component falls back to its idle directory.
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline in tests")));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  // Catalog adapters cache for ten minutes module-wide; without this a test
  // that loads a directory would hand its stations to the next one.
  resetGardenStationsCache();
  resetSomaChannelsCache();
  // Pinned/recents persist across tests in localStorage; deep-links write the URL.
  resetPinnedChannels();
  resetRecentChannels();
  window.history.replaceState({}, "", "/");
});

describe("Radio Atlas home view", () => {
  it("renders the header, world, dossier, and ruler", () => {
    render(<App />);

    expect(screen.getByTestId("input-station-search")).toBeTruthy();
    expect(screen.getByTestId("atlas-world")).toBeTruthy();
    expect(screen.getByTestId("deck")).toBeTruthy();
    expect(screen.getByTestId("frequency-ruler")).toBeTruthy();
    expect(screen.getByTestId("results-region")).toBeTruthy();
  });

  it("credits every contributing catalog in the footer", () => {
    render(<App />);

    const credit = screen.getByTestId("source-credit");
    expect(credit.textContent).toContain("RADIO.GARDEN");
    expect(credit.textContent).toContain("RADIO-BROWSER.INFO");
    expect(credit.textContent).toContain("SOMAFM.COM");
    const links = Array.from(credit.querySelectorAll("a")).map((link) =>
      link.getAttribute("href"),
    );
    expect(links).toEqual([
      "https://radio.garden/",
      "https://www.radio-browser.info/",
      "https://somafm.com/",
    ]);
  });

  it("keeps the world map on screen rather than deferring it behind a tab", () => {
    render(<App />);

    expect(screen.getByTestId("atlas-world")).toBeTruthy();
    expect(screen.queryByTestId("tab-map")).toBeNull();
  });

  it("opens on a dead directory with an idle, usable search box", async () => {
    render(<App />);

    await waitFor(() =>
      expect(screen.getByTestId("state-search-idle")).toBeTruthy(),
    );
    expect(screen.getByTestId("button-search-stations")).toBeTruthy();
  });

  it("keeps the list drawer closed until there is something to show", async () => {
    render(<App />);

    await waitFor(() =>
      expect(screen.getByTestId("state-search-idle")).toBeTruthy(),
    );
    const drawer = document.querySelector(".list-drawer");
    expect(drawer?.className).not.toContain("is-open");

    fireEvent.click(screen.getByTestId("button-open-list"));
    expect(drawer?.className).toContain("is-open");
  });

  it("opens the drawer and closes it with Escape, restoring the toggle focus", async () => {
    render(<App />);

    await waitFor(() =>
      expect(screen.getByTestId("state-search-idle")).toBeTruthy(),
    );
    const drawer = document.querySelector(".list-drawer");
    const toggle = screen.getByRole("button", { name: "Open station list" });

    fireEvent.click(toggle);
    expect(drawer?.className).toContain("is-open");

    const closeButton = document.querySelector<HTMLButtonElement>(".list-drawer__close");
    expect(document.activeElement).toBe(closeButton);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(drawer?.className).not.toContain("is-open");
    expect(document.activeElement).toBe(toggle);
  });

  it("offers a skip link that targets the player region", () => {
    render(<App />);

    const skip = screen.getByRole("link", { name: "Skip to player" });
    expect(skip.getAttribute("href")).toBe("#player");
    expect(document.getElementById("player")?.getAttribute("tabindex")).toBe("-1");
  });

  it("reads the directory as one merged group with no source switcher", async () => {
    render(<App />);

    await waitFor(() =>
      expect(screen.getByTestId("state-search-idle")).toBeTruthy(),
    );
    // No per-catalog switcher: every radio channel belongs to a single group.
    expect(screen.queryByRole("group", { name: "Channel source" })).toBeNull();
    expect(screen.queryByText("AIRWAVES")).toBeNull();
    expect(screen.queryByText("SOMA FM")).toBeNull();
    expect(screen.queryByText("RADIO GARDEN")).toBeNull();
    // The saved shelves still offer their own switcher.
    expect(screen.getByRole("group", { name: "Saved channels" })).toBeTruthy();
  });

  it("lists the scraped catalog while the atlas keeps the first paint", async () => {
    stubDirectory([
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
    ]);

    render(<App />);

    await waitFor(() =>
      expect(screen.getByTestId("list-station-results")).toBeTruthy(),
    );

    const list = screen.getByTestId("list-station-results");
    expect(within(list).getByText("Global Wave")).toBeTruthy();
    expect(within(list).getByText("Night Harbour")).toBeTruthy();
    expect(screen.getByTestId("text-result-count").textContent).toContain("2 SIGNALS");
    expect(screen.getByTestId("results-announcement").textContent).toBe("2 stations shown.");
    expect(screen.queryByTestId("state-search-idle")).toBeNull();
    // A cold load never covers the atlas — the header count is the way in.
    expect(document.querySelector(".list-drawer")?.className).not.toContain("is-open");

    fireEvent.click(screen.getByTestId("button-open-list"));
    expect(document.querySelector(".list-drawer")?.className).toContain("is-open");
  });

  it("slides the directory open once a scan is submitted", async () => {
    stubDirectory([
      {
        stationuuid: "trend-1",
        name: "Global Wave",
        url: "https://stream.example/wave",
        countrycode: "FR",
        country: "France",
        geo_lat: 48.85,
        geo_long: 2.35,
      },
    ]);

    render(<App />);

    await waitFor(() =>
      expect(screen.getByTestId("list-station-results")).toBeTruthy(),
    );
    expect(document.querySelector(".list-drawer")?.className).not.toContain("is-open");

    fireEvent.change(screen.getByTestId("input-station-search"), {
      target: { value: "Global Wave" },
    });
    fireEvent.submit(screen.getByTestId("form-station-search"));

    await waitFor(() =>
      expect(document.querySelector(".list-drawer")?.className).toContain("is-open"),
    );
    expect(within(screen.getByTestId("list-station-results")).getByText("Global Wave")).toBeTruthy();
  });

  it("pages a dense directory instead of rendering every row at once", async () => {
    stubDirectory(
      Array.from({ length: 150 }, (_, index) => ({
        stationuuid: `page-${index}`,
        name: `Channel ${String(index).padStart(3, "0")}`,
        url: `https://stream.example/${index}`,
        tags: "world",
        country: "France",
        countrycode: "FR",
        geo_lat: 48.85,
        geo_long: 2.35,
      })),
    );

    render(<App />);

    await waitFor(() => expect(screen.getByTestId("list-station-results")).toBeTruthy());

    const rows = () => within(screen.getByTestId("list-station-results")).getAllByTestId(/^button-select-station-/);
    expect(rows()).toHaveLength(60);

    const more = screen.getByTestId("button-more-stations");
    expect(more.textContent).toContain("Show next 60 channels");
    expect(more.textContent).toContain("90 still in the directory");

    fireEvent.click(more);
    expect(rows()).toHaveLength(120);

    fireEvent.click(screen.getByTestId("button-more-stations"));
    expect(rows()).toHaveLength(150);
    expect(screen.queryByTestId("button-more-stations")).toBeNull();
  });

  it("hops channels from the dossier without dragging the drawer open", async () => {
    stubDirectory([
      {
        stationuuid: "hop-1",
        name: "Alpha Wave",
        url: "https://stream.example/1",
        country: "France",
        countrycode: "FR",
        geo_lat: 48.85,
        geo_long: 2.35,
      },
      {
        stationuuid: "hop-2",
        name: "Night Harbour",
        url: "https://stream.example/2",
        country: "Japan",
        countrycode: "JP",
        geo_lat: 35.68,
        geo_long: 139.69,
      },
      {
        stationuuid: "hop-3",
        name: "Delta Beat",
        url: "https://stream.example/3",
        country: "France",
        countrycode: "FR",
        geo_lat: 45.76,
        geo_long: 4.83,
      },
    ]);

    render(<App />);

    await waitFor(() => expect(screen.getByTestId("list-station-results")).toBeTruthy());
    await waitFor(() =>
      expect(screen.getByTestId("deck-station-name").textContent).not.toBe("No station locked"),
    );
    const locked = screen.getByTestId("deck-station-name").textContent;

    fireEvent.click(screen.getByTestId("deck-next-button"));
    await waitFor(() =>
      expect(screen.getByTestId("deck-station-name").textContent).not.toBe(locked),
    );

    fireEvent.click(screen.getByTestId("deck-prev-button"));
    await waitFor(() =>
      expect(screen.getByTestId("deck-station-name").textContent).toBe(locked),
    );

    // Hopping is a deliberate act — it never drags the drawer open.
    expect(document.querySelector(".list-drawer")?.className).not.toContain("is-open");
  });

  it("plots the directory as pips on the world and locks the nearest one", async () => {
    stubDirectory([
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
    ]);

    render(<App />);

    await waitFor(() => expect(screen.getByTestId("atlas-world")).toBeTruthy());
    await waitFor(() =>
      expect(document.querySelectorAll(".atlas-world__pip").length).toBe(2),
    );

    // The world locks the station nearest the viewport centre (no audio in tests).
    await waitFor(() =>
      expect(document.querySelector(".atlas-world__pip.is-selected")).toBeTruthy(),
    );
    expect(screen.getByTestId("deck-station-name").textContent).not.toBe(
      "No station locked",
    );
    // The dossier shows a synthetic carrier read-out.
    expect(screen.getByTestId("dossier-frequency").textContent).toMatch(/\d+\.\d{2} MHz/);
  });

  it("keeps the random tuner disabled until the directory has stations", async () => {
    render(<App />);

    await waitFor(() =>
      expect(screen.getByTestId("state-search-idle")).toBeTruthy(),
    );
    expect((screen.getByTestId("button-shuffle-station") as HTMLButtonElement).disabled).toBe(true);
  });

  it("locks a different random station and reveals it in the list", async () => {
    stubDirectory([
      {
        stationuuid: "trend-1",
        name: "Global Wave",
        url: "https://stream.example/wave",
        tags: "world",
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
    ]);
    vi.spyOn(window.HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);

    render(<App />);

    await waitFor(() =>
      expect(screen.getByTestId("list-station-results")).toBeTruthy(),
    );
    const shuffle = screen.getByTestId("button-shuffle-station") as HTMLButtonElement;
    expect(shuffle.disabled).toBe(false);

    // The atlas locks the nearest station on its own once the pips land.
    await waitFor(() =>
      expect(screen.getByTestId("deck-station-name").textContent).not.toBe("No station locked"),
    );
    const lockedBefore = screen.getByTestId("deck-station-name").textContent;
    fireEvent.click(shuffle);

    const lockedAfter = screen.getByTestId("deck-station-name").textContent;
    expect(lockedAfter).not.toBe(lockedBefore);
    expect(["Global Wave", "Night Harbour"]).toContain(lockedAfter);
    // The shuffle reveals what it picked in the directory drawer.
    expect(document.querySelector(".list-drawer")?.className).toContain("is-open");
  });

  it("narrows the directory through the country facet", async () => {
    stubDirectory([
      {
        stationuuid: "trend-1",
        name: "Global Wave",
        url: "https://stream.example/wave",
        tags: "world",
        countrycode: "FR",
        country: "France",
        state: "Île-de-France",
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
        state: "Kanto",
        geo_lat: 35.68,
        geo_long: 139.69,
      },
    ]);

    render(<App />);

    await waitFor(() =>
      expect(screen.getByTestId("list-station-results")).toBeTruthy(),
    );
    expect(screen.getByTestId("text-result-count").textContent).toContain("2 SIGNALS");

    fireEvent.change(screen.getByTestId("filter-country"), { target: { value: "France" } });

    expect(screen.getByTestId("text-result-count").textContent).toContain("1 SIGNAL");
    const list = screen.getByTestId("list-station-results");
    expect(within(list).getByText("Global Wave")).toBeTruthy();
    expect(within(list).queryByText("Night Harbour")).toBeNull();
    // Picking a country keeps it offered while narrowing the region list.
    const country = screen.getByTestId("filter-country") as HTMLSelectElement;
    expect(Array.from(country.options).map((option) => option.value)).toEqual([
      "",
      "France",
      "Japan",
    ]);
    const state = screen.getByTestId("filter-state") as HTMLSelectElement;
    expect(Array.from(state.options).map((option) => option.value)).toEqual(["", "Île-de-France"]);
  });

  it("offers directory-wide suggestions from the header field", async () => {
    stubDirectory([
      {
        stationuuid: "sug-1",
        name: "Global Wave",
        url: "https://stream.example/wave",
        tags: "world",
        country: "France",
        countrycode: "FR",
        city: "Paris",
        geo_lat: 48.85,
        geo_long: 2.35,
      },
      {
        stationuuid: "sug-2",
        name: "Night Harbour",
        url: "https://stream.example/harbour",
        tags: "ambient",
        country: "Japan",
        countrycode: "JP",
        city: "Tokyo",
        geo_lat: 35.68,
        geo_long: 139.69,
      },
    ]);
    vi.spyOn(window.HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);

    render(<App />);
    await waitFor(() => expect(screen.getByTestId("list-station-results")).toBeTruthy());

    const input = screen.getByTestId("input-station-search");
    fireEvent.focus(input);
    const palette = screen.getByTestId("search-palette");
    // An empty field opens on the catalog's busiest countries and genres.
    await waitFor(() => expect(palette.textContent).toContain("France"));
    expect(palette.textContent).toContain("world");

    fireEvent.change(input, { target: { value: "Night Harbour" } });
    await waitFor(() => expect(within(palette).getByText("Night Harbour")).toBeTruthy());

    // Picking the suggestion tunes the channel without opening the drawer.
    fireEvent.click(within(palette).getByTestId("palette-option-station-0"));
    await waitFor(() =>
      expect(screen.getByTestId("deck-station-name").textContent).toBe("Night Harbour"),
    );
    expect(document.querySelector(".list-drawer")?.className).not.toContain("is-open");
  });

  it("sorts the directory on demand", async () => {
    stubDirectory([
      {
        stationuuid: "trend-1",
        name: "Zulu Radio",
        url: "https://stream.example/zulu",
        tags: "world",
      },
      {
        stationuuid: "trend-2",
        name: "Alpha Radio",
        url: "https://stream.example/alpha",
        tags: "world",
      },
    ]);

    render(<App />);

    await waitFor(() =>
      expect(screen.getByTestId("list-station-results")).toBeTruthy(),
    );
    expect(within(screen.getByTestId("list-station-results")).getByText("Zulu Radio")).toBeTruthy();

    fireEvent.change(screen.getByTestId("filter-sort"), { target: { value: "name" } });

    const rows = Array.from(document.querySelectorAll(".station-name")).map(
      (node) => node.textContent,
    );
    expect(rows).toEqual(["Alpha Radio", "Zulu Radio"]);
  });
});

describe("Radio Atlas view modes", () => {
  it("drops the chrome for zen mode and restores it with Escape", () => {
    render(<App />);
    const app = screen.getByTestId("page-radio-explorer");
    const toggle = screen.getByTestId("button-toggle-zen");

    expect(app.className).not.toContain("is-zen");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(toggle);
    expect(app.className).toContain("is-zen");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(toggle.textContent).toContain("Exit zen");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(app.className).not.toContain("is-zen");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
  });

  it("runs the screen saver on demand and wakes it back into zen", () => {
    render(<App />);
    const app = screen.getByTestId("page-radio-explorer");
    expect(screen.queryByTestId("screensaver")).toBeNull();

    fireEvent.click(screen.getByTestId("button-toggle-zen"));
    fireEvent.click(screen.getByTestId("button-start-screensaver"));
    expect(screen.getByTestId("screensaver")).toBeTruthy();
    expect(app.className).toContain("is-zen");
    expect(app.className).toContain("is-screensaver");
    expect(screen.getByTestId("screensaver-station-name").textContent).toBe(
      "No station locked",
    );
    // The saver keeps its own transport without waking itself.
    expect(
      screen.getByTestId("screensaver-play").hasAttribute("data-screensaver-control"),
    ).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("screensaver")).toBeNull();
    expect(app.className).not.toContain("is-screensaver");
    expect(app.className).toContain("is-zen");
  });

  it("wakes from the saver's own wake control", () => {
    render(<App />);

    fireEvent.click(screen.getByTestId("button-start-screensaver"));
    expect(screen.getByTestId("screensaver")).toBeTruthy();

    fireEvent.click(screen.getByTestId("button-wake-screensaver"));
    expect(screen.queryByTestId("screensaver")).toBeNull();
  });

  it("dozes into the screen saver on its own after a minute of stillness", async () => {
    vi.useFakeTimers();
    try {
      render(<App />);
      await act(async () => {});

      expect(screen.queryByTestId("screensaver")).toBeNull();
      act(() => {
        vi.advanceTimersByTime(SCREENSAVER_IDLE_MS - 1);
      });
      expect(screen.queryByTestId("screensaver")).toBeNull();

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(screen.getByTestId("screensaver")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("holds off auto-engaging while the directory is open", async () => {
    vi.useFakeTimers();
    try {
      render(<App />);
      await act(async () => {});

      fireEvent.click(screen.getByTestId("button-open-list"));
      act(() => {
        vi.advanceTimersByTime(SCREENSAVER_IDLE_MS * 2);
      });
      expect(screen.queryByTestId("screensaver")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Radio Atlas channel keeping", () => {
  const twoStationDirectory = () =>
    stubDirectory([
      {
        stationuuid: "trend-1",
        name: "Global Wave",
        url: "https://stream.example/wave",
        tags: "world",
        country: "France",
        countrycode: "FR",
        geo_lat: 48.85,
        geo_long: 2.35,
      },
      {
        stationuuid: "trend-2",
        name: "Night Harbour",
        url: "https://stream.example/harbour",
        tags: "ambient",
        country: "Japan",
        countrycode: "JP",
        geo_lat: 35.68,
        geo_long: 139.69,
      },
    ]);

  it("keeps a channel by pinning its row and finds it on the pinned shelf", async () => {
    twoStationDirectory();

    render(<App />);
    await waitFor(() => expect(screen.getByTestId("list-station-results")).toBeTruthy());

    const pin = screen.getByTestId("button-pin-station-garden:trend-1");
    expect(pin.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(pin);
    expect(pin.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("button-open-pinned").textContent).toContain("Pinned: 1");

    fireEvent.click(screen.getByTestId("button-open-pinned"));
    await waitFor(() =>
      expect(screen.getByTestId("list-drawer-heading").textContent).toContain("pinned channel"),
    );
    const list = screen.getByTestId("list-station-results");
    expect(within(list).getByText("Global Wave")).toBeTruthy();
    expect(within(list).queryByText("Night Harbour")).toBeNull();
  });

  it("pins the tuned channel from the keyboard and copies a share link", async () => {
    twoStationDirectory();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(<App />);
    await waitFor(() => expect(screen.getByTestId("list-station-results")).toBeTruthy());
    await waitFor(() =>
      expect(screen.getByTestId("deck-station-name").textContent).not.toBe("No station locked"),
    );
    const tuned = screen.getByTestId("deck-station-name").textContent;

    fireEvent.keyDown(document, { key: "p" });
    expect(screen.getByTestId("deck-pin-button").getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByTestId("deck-mute-button"));
    expect(screen.getByTestId("deck-mute-button").getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByTestId("deck-share-button"));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(String(writeText.mock.calls[0][0])).toContain("?station=");
    await waitFor(() =>
      expect(screen.getByTestId("deck-share-state").textContent).toContain("LINK COPIED"),
    );

    // The tuned channel's name is what the dossier locked; pin mirrored into the shelf count.
    expect(tuned).not.toBe("No station locked");
    expect(screen.getByTestId("button-open-pinned").textContent).toContain("Pinned: 1");
  });

  it("restores a shared deep-link station on open", async () => {
    twoStationDirectory();
    window.history.replaceState({}, "", "/?station=garden:trend-2");

    render(<App />);

    await waitFor(() =>
      expect(screen.getByTestId("deck-station-name").textContent).toBe("Night Harbour"),
    );
  });

  it("tunes the last played channel on a new visit", async () => {
    twoStationDirectory();
    vi.spyOn(window.HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    // Night Harbour is the newest dial-log entry (and only the second-nearest
    // signal to the map centre), so restoring it proves the log won the lock.
    recordChannel({
      id: "garden:trend-2",
      name: "Night Harbour",
      genres: [],
      streams: [{ url: "https://stream.example/harbour" }],
      countryCode: "JP",
      country: "Japan",
      coordinates: [139.69, 35.68],
    });

    render(<App />);

    await waitFor(() =>
      expect(screen.getByTestId("deck-station-name").textContent).toBe("Night Harbour"),
    );
  });

  it("falls back to the closest locale channel when the last played one is gone", async () => {
    twoStationDirectory();
    vi.spyOn(window.HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const originalLanguage = Object.getOwnPropertyDescriptor(window.navigator, "language");
    Object.defineProperty(window.navigator, "language", {
      configurable: true,
      value: "fr-FR",
    });
    recordChannel({
      id: "garden:vanished",
      name: "Vanished FM",
      genres: [],
      streams: [{ url: "https://stream.example/vanished" }],
      countryCode: "FR",
      country: "France",
    });

    try {
      render(<App />);

      await waitFor(() =>
        expect(screen.getByTestId("deck-station-name").textContent).toBe("Global Wave"),
      );
    } finally {
      if (originalLanguage) {
        Object.defineProperty(window.navigator, "language", originalLanguage);
      } else {
        Reflect.deleteProperty(window.navigator, "language");
      }
    }
  });

  it("arms a sleep timer from the dossier transport", async () => {
    twoStationDirectory();

    render(<App />);
    await waitFor(() => expect(screen.getByTestId("list-station-results")).toBeTruthy());
    await waitFor(() =>
      expect(screen.getByTestId("deck-station-name").textContent).not.toBe("No station locked"),
    );

    fireEvent.click(screen.getByTestId("deck-sleep-button"));
    expect(screen.getByTestId("sleep-timer-menu")).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-sleep-15"));

    expect(screen.queryByTestId("sleep-timer-menu")).toBeNull();
    await waitFor(() =>
      expect(screen.getByTestId("deck-sleep-remaining").textContent).toMatch(/SLEEP \d+:\d+/),
    );

    // Disarming puts the transport back to its resting label.
    fireEvent.click(screen.getByTestId("deck-sleep-button"));
    fireEvent.click(screen.getByTestId("button-sleep-off"));
    expect(screen.queryByTestId("deck-sleep-remaining")).toBeNull();
  });
});
