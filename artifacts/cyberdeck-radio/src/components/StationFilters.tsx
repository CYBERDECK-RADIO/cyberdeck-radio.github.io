/**
 * Country/genre filter controls for the station results.
 *
 *   countries + genres ──▶ two <select>s (with an "all" option)
 *   user picks ──▶ onCountryChange / onGenreChange (null = cleared)
 *   any filter active ──▶ clear control ──▶ onClear
 *
 * Presentational only: it renders the options it is given and reports intent.
 */

import { SlidersHorizontal, X } from "lucide-react";

type StationFiltersProps = {
  countries: string[];
  genres: string[];
  country: string | null;
  genre: string | null;
  onCountryChange: (value: string | null) => void;
  onGenreChange: (value: string | null) => void;
  onClear: () => void;
};

export default function StationFilters({
  countries,
  genres,
  country,
  genre,
  onCountryChange,
  onGenreChange,
  onClear,
}: StationFiltersProps) {
  const hasActiveFilter = country !== null || genre !== null;

  return (
    <div className="station-filters" data-testid="station-filters">
      <span className="station-filters__label">
        <SlidersHorizontal aria-hidden="true" />
        Filter
      </span>
      <label className="station-filters__field">
        <span className="sr-only">Filter by country</span>
        <select
          value={country ?? ""}
          onChange={(event) => onCountryChange(event.target.value || null)}
          data-testid="filter-country"
        >
          <option value="">All countries</option>
          {countries.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <label className="station-filters__field">
        <span className="sr-only">Filter by genre</span>
        <select
          value={genre ?? ""}
          onChange={(event) => onGenreChange(event.target.value || null)}
          data-testid="filter-genre"
        >
          <option value="">All genres</option>
          {genres.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      {hasActiveFilter && (
        <button
          type="button"
          className="station-filters__clear"
          onClick={onClear}
          data-testid="filter-clear"
        >
          <X aria-hidden="true" />
          Clear
        </button>
      )}
    </div>
  );
}