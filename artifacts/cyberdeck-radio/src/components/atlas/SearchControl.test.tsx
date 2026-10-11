// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";

import SearchControl from "./SearchControl";
import { RECENT_SEARCHES_KEY } from "@/stations/recent-searches";
import type Station from "@/stations/types";

function station(id: string, name: string, extra: Partial<Station> = {}): Station {
  return {
    id,
    name,
    genres: [],
    streams: [{ url: `https://stream.example/${id}` }],
    ...extra,
  };
}

const catalog: Station[] = [
  station("paris-jazz", "Paris Jazz FM", {
    country: "France",
    countryCode: "FR",
    city: "Paris",
    genres: ["jazz"],
  }),
  station("lyon-jazz", "Lyon Jazz", {
    country: "France",
    city: "Lyon",
    genres: ["jazz"],
  }),
  station("tokyo-wave", "Tokyo Wave", {
    country: "Japan",
    city: "Tokyo",
    genres: ["world"],
  }),
  station("berlin-ambient", "Berlin Ambient", {
    country: "Germany",
    city: "Berlin",
    genres: ["ambient"],
  }),
];

type HarnessProps = {
  stations?: Station[];
  initialQuery?: string;
  onSelectStation?: (id: string, options?: { autoplay?: boolean }) => void;
  onSearch?: (query: string) => void;
  onClear?: () => void;
};

/** The field is controlled, so the harness owns the query like App does. */
function Harness({
  stations = catalog,
  initialQuery = "",
  onSelectStation = vi.fn(),
  onSearch = vi.fn(),
  onClear = vi.fn(),
}: HarnessProps) {
  const [query, setQuery] = useState(initialQuery);
  return (
    <SearchControl
      query={query}
      onQueryChange={setQuery}
      onSearch={onSearch}
      onClear={onClear}
      placeholder="Search city, frequency, callsign…"
      stations={stations}
      onSelectStation={onSelectStation}
    />
  );
}

function palette() {
  return screen.getByTestId("search-palette");
}

function optionLabels(): string[] {
  return within(palette())
    .getAllByRole("option")
    .map((option) => option.querySelector(".atlas-search__option-label")?.textContent ?? "");
}

describe("SearchControl", () => {
  beforeEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("is a combobox that opens its palette on focus", async () => {
    render(<Harness />);

    const input = screen.getByTestId("input-station-search");
    expect(input.getAttribute("role")).toBe("combobox");
    expect(input.getAttribute("aria-expanded")).toBe("false");

    fireEvent.focus(input);
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(palette()).toBeTruthy();

    // Nothing typed yet: the palette opens on the busiest countries and genres.
    await waitFor(() => expect(optionLabels()).toContain("France"));
    expect(optionLabels()).toContain("jazz");
  });

  it("groups live suggestions into stations, places, genres, and a scan row", async () => {
    render(<Harness />);

    fireEvent.change(screen.getByTestId("input-station-search"), {
      target: { value: "jazz" },
    });

    await waitFor(() => expect(optionLabels()).toContain("Paris Jazz FM"));
    const labels = optionLabels();
    expect(labels).toContain("Lyon Jazz");
    expect(labels).toContain("jazz");
    expect(labels).toContain("Scan “jazz”");
    const groups = within(palette())
      .getAllByRole("group")
      .map((group) => group.getAttribute("aria-label"));
    expect(groups).toEqual(["Stations", "Genres", "Search"]);
  });

  it("tunes the station a highlighted option stands for", async () => {
    const onSelectStation = vi.fn();
    render(<Harness onSelectStation={onSelectStation} />);

    fireEvent.change(screen.getByTestId("input-station-search"), {
      target: { value: "tokyo" },
    });
    await waitFor(() => expect(optionLabels()).toContain("Tokyo Wave"));

    const input = screen.getByTestId("input-station-search");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBe("palette-option-0");
    expect(
      screen.getByTestId("palette-option-station-0").getAttribute("aria-selected"),
    ).toBe("true");

    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelectStation).toHaveBeenCalledWith("tokyo-wave", { autoplay: true });
    expect(screen.queryByTestId("search-palette")).toBeNull();
  });

  it("scans on Enter when nothing is highlighted", async () => {
    const onSearch = vi.fn();
    render(<Harness onSearch={onSearch} />);

    fireEvent.change(screen.getByTestId("input-station-search"), {
      target: { value: "jazz" },
    });
    await waitFor(() => expect(optionLabels()).toContain("Paris Jazz FM"));

    fireEvent.submit(screen.getByTestId("form-station-search"));
    expect(onSearch).toHaveBeenCalledWith("jazz");
    expect(screen.queryByTestId("search-palette")).toBeNull();
  });

  it("fills the field and scans when a country option is picked", async () => {
    const onSearch = vi.fn();
    render(<Harness onSearch={onSearch} />);

    fireEvent.change(screen.getByTestId("input-station-search"), {
      target: { value: "france" },
    });
    await waitFor(() => expect(optionLabels()).toContain("Paris Jazz FM"));

    fireEvent.click(screen.getByTestId("palette-option-country-2"));
    expect(onSearch).toHaveBeenCalledWith("France");
    expect(screen.getByTestId("input-station-search")).toHaveProperty("value", "France");
  });

  it("offers remembered scans back under Recent", async () => {
    const onSearch = vi.fn();
    const first = render(<Harness onSearch={onSearch} />);
    fireEvent.change(screen.getByTestId("input-station-search"), {
      target: { value: "ambient" },
    });
    await waitFor(() => expect(optionLabels()).toContain("Scan “ambient”"));
    fireEvent.submit(screen.getByTestId("form-station-search"));
    expect(JSON.parse(window.localStorage.getItem(RECENT_SEARCHES_KEY) ?? "[]")).toEqual([
      "ambient",
    ]);
    first.unmount();

    const second = vi.fn();
    render(<Harness onSearch={second} />);
    fireEvent.focus(screen.getByTestId("input-station-search"));
    await waitFor(() => expect(optionLabels()).toContain("ambient"));
    const groups = within(palette())
      .getAllByRole("group")
      .map((group) => group.getAttribute("aria-label"));
    expect(groups[0]).toBe("Recent");

    fireEvent.click(screen.getByTestId("palette-option-recent-0"));
    expect(second).toHaveBeenCalledWith("ambient");
  });

  it("closes the palette on Escape without scanning", async () => {
    const onSearch = vi.fn();
    render(<Harness onSearch={onSearch} />);

    const input = screen.getByTestId("input-station-search");
    fireEvent.focus(input);
    expect(screen.getByTestId("search-palette")).toBeTruthy();

    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByTestId("search-palette")).toBeNull();
    expect(onSearch).not.toHaveBeenCalled();
  });

  it("summons itself with / and with the platform shortcut", () => {
    render(<Harness />);
    const input = screen.getByTestId("input-station-search") as HTMLInputElement;

    fireEvent.keyDown(document, { key: "/" });
    expect(document.activeElement).toBe(input);
    expect(screen.getByTestId("search-palette")).toBeTruthy();

    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    expect(document.activeElement).toBe(input);
  });

  it("clears the field and whatever the last scan left behind", () => {
    const onClear = vi.fn();
    render(<Harness initialQuery="jazz" onClear={onClear} />);

    const clear = screen.getByTestId("button-clear-search");
    fireEvent.click(clear);
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("input-station-search")).toHaveProperty("value", "");
    expect(screen.queryByTestId("button-clear-search")).toBeNull();
  });

  it("explains an empty palette instead of showing a blank box", () => {
    render(<Harness stations={[]} />);

    fireEvent.focus(screen.getByTestId("input-station-search"));
    expect(screen.getByTestId("search-palette-empty").textContent).toContain(
      "The directory is empty",
    );
  });
});
