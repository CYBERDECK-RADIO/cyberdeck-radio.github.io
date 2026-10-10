// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import StationFilters from "./StationFilters";

afterEach(cleanup);

function renderFilters(overrides: Partial<Parameters<typeof StationFilters>[0]> = {}) {
  const onCountryChange = vi.fn();
  const onGenreChange = vi.fn();
  const onClear = vi.fn();
  render(
    <StationFilters
      countries={["France", "Japan"]}
      genres={["jazz", "pop"]}
      country={null}
      genre={null}
      onCountryChange={onCountryChange}
      onGenreChange={onGenreChange}
      onClear={onClear}
      {...overrides}
    />,
  );
  return { onCountryChange, onGenreChange, onClear };
}

describe("StationFilters", () => {
  it("lists an all-option plus every country and genre", () => {
    renderFilters();

    const country = screen.getByTestId("filter-country") as HTMLSelectElement;
    const genre = screen.getByTestId("filter-genre") as HTMLSelectElement;

    expect(Array.from(country.options).map((option) => option.value)).toEqual(["", "France", "Japan"]);
    expect(Array.from(genre.options).map((option) => option.value)).toEqual(["", "jazz", "pop"]);
  });

  it("reports a selected country and genre", () => {
    const { onCountryChange, onGenreChange } = renderFilters();

    fireEvent.change(screen.getByTestId("filter-country"), { target: { value: "Japan" } });
    fireEvent.change(screen.getByTestId("filter-genre"), { target: { value: "jazz" } });

    expect(onCountryChange).toHaveBeenCalledWith("Japan");
    expect(onGenreChange).toHaveBeenCalledWith("jazz");
  });

  it("reports null when a filter is reset to the all-option", () => {
    const { onCountryChange } = renderFilters({ country: "Japan" });

    fireEvent.change(screen.getByTestId("filter-country"), { target: { value: "" } });

    expect(onCountryChange).toHaveBeenCalledWith(null);
  });

  it("hides the clear control when no filter is active", () => {
    renderFilters();

    expect(screen.queryByTestId("filter-clear")).toBeNull();
  });

  it("shows the clear control and calls onClear when a filter is active", () => {
    const { onClear } = renderFilters({ country: "Japan" });

    const clear = screen.getByTestId("filter-clear");
    clear.click();

    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("reflects the active filter values", () => {
    renderFilters({ country: "France", genre: "pop" });

    expect((screen.getByTestId("filter-country") as HTMLSelectElement).value).toBe("France");
    expect((screen.getByTestId("filter-genre") as HTMLSelectElement).value).toBe("pop");
  });
});