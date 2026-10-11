// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import StationFilters from "./StationFilters";
import {
  EMPTY_FILTERS,
  type StationFilterOptions,
  type StationSort,
} from "@/stations/filter-stations";

afterEach(cleanup);

const allOptions: StationFilterOptions = {
  countries: ["France", "Japan"],
  states: ["Tokyo"],
  cities: ["Paris", "Shibuya", "Tokyo"],
  genres: ["jazz", "pop"],
  codecs: ["AAC", "MP3"],
};

function renderFilters(overrides: Partial<Parameters<typeof StationFilters>[0]> = {}) {
  const onFilterChange = vi.fn();
  const onSortChange = vi.fn();
  const onClear = vi.fn();
  render(
    <StationFilters
      options={allOptions}
      filters={EMPTY_FILTERS}
      sort="relevance"
      onFilterChange={onFilterChange}
      onSortChange={onSortChange}
      onClear={onClear}
      {...overrides}
    />,
  );
  return { onFilterChange, onSortChange, onClear };
}

describe("StationFilters", () => {
  it("lists an all-option plus every facet option and the sort choices", () => {
    renderFilters();

    const country = screen.getByTestId("filter-country") as HTMLSelectElement;
    const state = screen.getByTestId("filter-state") as HTMLSelectElement;
    const city = screen.getByTestId("filter-city") as HTMLSelectElement;
    const genre = screen.getByTestId("filter-genre") as HTMLSelectElement;
    const codec = screen.getByTestId("filter-codec") as HTMLSelectElement;
    const sort = screen.getByTestId("filter-sort") as HTMLSelectElement;

    expect(Array.from(country.options).map((option) => option.value)).toEqual(["", "France", "Japan"]);
    expect(Array.from(state.options).map((option) => option.value)).toEqual(["", "Tokyo"]);
    expect(Array.from(city.options).map((option) => option.value)).toEqual(["", "Paris", "Shibuya", "Tokyo"]);
    expect(Array.from(genre.options).map((option) => option.value)).toEqual(["", "jazz", "pop"]);
    expect(Array.from(codec.options).map((option) => option.value)).toEqual(["", "AAC", "MP3"]);
    expect(Array.from(sort.options).map((option) => option.value)).toEqual([
      "relevance",
      "name",
      "country",
      "bitrate",
    ]);
  });

  it("hides facets whose option list is empty and nothing is selected", () => {
    renderFilters({
      options: { countries: ["France"], states: [], cities: [], genres: [], codecs: [] },
    });

    expect(screen.queryByTestId("filter-state")).toBeNull();
    expect(screen.queryByTestId("filter-city")).toBeNull();
    expect(screen.queryByTestId("filter-genre")).toBeNull();
    expect(screen.queryByTestId("filter-codec")).toBeNull();
    expect(screen.getByTestId("filter-country")).toBeTruthy();
  });

  it("keeps an active facet visible even when its options no longer list it", () => {
    renderFilters({
      options: { countries: [], states: [], cities: [], genres: [], codecs: [] },
      filters: { ...EMPTY_FILTERS, city: "Tokyo" },
    });

    const city = screen.getByTestId("filter-city") as HTMLSelectElement;
    expect(Array.from(city.options).map((option) => option.value)).toEqual(["", "Tokyo"]);
    expect(city.value).toBe("Tokyo");
  });

  it("reports the picked facet", () => {
    const { onFilterChange } = renderFilters();

    fireEvent.change(screen.getByTestId("filter-country"), { target: { value: "Japan" } });
    fireEvent.change(screen.getByTestId("filter-state"), { target: { value: "Tokyo" } });
    fireEvent.change(screen.getByTestId("filter-city"), { target: { value: "Shibuya" } });
    fireEvent.change(screen.getByTestId("filter-genre"), { target: { value: "jazz" } });
    fireEvent.change(screen.getByTestId("filter-codec"), { target: { value: "MP3" } });

    expect(onFilterChange).toHaveBeenCalledWith("country", "Japan");
    expect(onFilterChange).toHaveBeenCalledWith("state", "Tokyo");
    expect(onFilterChange).toHaveBeenCalledWith("city", "Shibuya");
    expect(onFilterChange).toHaveBeenCalledWith("genre", "jazz");
    expect(onFilterChange).toHaveBeenCalledWith("codec", "MP3");
  });

  it("reports null when a facet is reset to the all-option", () => {
    const { onFilterChange } = renderFilters({ filters: { ...EMPTY_FILTERS, country: "Japan" } });

    fireEvent.change(screen.getByTestId("filter-country"), { target: { value: "" } });

    expect(onFilterChange).toHaveBeenCalledWith("country", null);
  });

  it("reflects the active facet values", () => {
    renderFilters({
      filters: { country: "France", state: null, city: "Paris", genre: "pop", codec: "AAC" },
      sort: "bitrate",
    });

    expect((screen.getByTestId("filter-country") as HTMLSelectElement).value).toBe("France");
    expect((screen.getByTestId("filter-city") as HTMLSelectElement).value).toBe("Paris");
    expect((screen.getByTestId("filter-genre") as HTMLSelectElement).value).toBe("pop");
    expect((screen.getByTestId("filter-codec") as HTMLSelectElement).value).toBe("AAC");
    expect((screen.getByTestId("filter-sort") as HTMLSelectElement).value).toBe("bitrate");
  });

  it("reports a sort change", () => {
    const { onSortChange } = renderFilters();

    fireEvent.change(screen.getByTestId("filter-sort"), { target: { value: "name" } });

    expect(onSortChange).toHaveBeenCalledWith("name");
  });

  it("hides the clear control when nothing is active", () => {
    renderFilters();

    expect(screen.queryByTestId("filter-clear")).toBeNull();
  });

  it("shows clear and calls onClear when a facet or the sort is active", () => {
    const { onClear } = renderFilters({ filters: { ...EMPTY_FILTERS, country: "Japan" } });
    fireEvent.click(screen.getByTestId("filter-clear"));
    expect(onClear).toHaveBeenCalledTimes(1);

    cleanup();
    const { onClear: onClearSort } = renderFilters({ sort: "name" as StationSort });
    fireEvent.click(screen.getByTestId("filter-clear"));
    expect(onClearSort).toHaveBeenCalledTimes(1);
  });
});
