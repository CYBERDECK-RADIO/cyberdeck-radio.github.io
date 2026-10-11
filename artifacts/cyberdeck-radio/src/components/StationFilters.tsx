/**
 * Faceted filter + sort controls for the station results.
 *
 *   option lists + active filters ──▶ cascading <select>s (country → region →
 *     city → genre → codec, each with an "all" option)
 *   user picks ──▶ onFilterChange(facet, value) (null = cleared)
 *   sort       ──▶ onSortChange
 *   anything active ──▶ clear control ──▶ onClear
 *
 * Presentational only: it renders the options it is given and reports intent.
 * A facet stays visible (and pins its own current value) while it is active so
 * a selection can always be seen and cleared.
 */

import {
  SORT_LABELS,
  STATION_SORTS,
  hasActiveFilters,
  type StationFilterOptions,
  type StationFilters,
  type StationSort,
} from "@/stations/filter-stations";
import { SlidersHorizontal, X } from "lucide-react";

type StationFiltersProps = {
  options: StationFilterOptions;
  filters: StationFilters;
  sort: StationSort;
  onFilterChange: (facet: keyof StationFilters, value: string | null) => void;
  onSortChange: (sort: StationSort) => void;
  onClear: () => void;
};

type FacetSelectProps = {
  testId: string;
  label: string;
  allLabel: string;
  values: string[];
  active: string | null;
  onChange: (value: string | null) => void;
};

function FacetSelect({
  testId,
  label,
  allLabel,
  values,
  active,
  onChange,
}: FacetSelectProps) {
  const entries =
    active !== null && !values.includes(active) ? [active, ...values] : values;
  if (entries.length === 0) return null;

  return (
    <label className="station-filters__field">
      <span className="sr-only">{label}</span>
      <select
        value={active ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
        aria-label={label}
        data-testid={testId}
      >
        <option value="">{allLabel}</option>
        {entries.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function StationFilters({
  options,
  filters,
  sort,
  onFilterChange,
  onSortChange,
  onClear,
}: StationFiltersProps) {
  const dirty = hasActiveFilters(filters) || sort !== "relevance";

  return (
    <div className="station-filters" data-testid="station-filters">
      <span className="station-filters__label">
        <SlidersHorizontal aria-hidden="true" />
        Filter
      </span>
      <FacetSelect
        testId="filter-country"
        label="Filter by country"
        allLabel="All countries"
        values={options.countries}
        active={filters.country}
        onChange={(value) => onFilterChange("country", value)}
      />
      <FacetSelect
        testId="filter-state"
        label="Filter by region"
        allLabel="All regions"
        values={options.states}
        active={filters.state}
        onChange={(value) => onFilterChange("state", value)}
      />
      <FacetSelect
        testId="filter-city"
        label="Filter by city"
        allLabel="All cities"
        values={options.cities}
        active={filters.city}
        onChange={(value) => onFilterChange("city", value)}
      />
      <FacetSelect
        testId="filter-genre"
        label="Filter by genre"
        allLabel="All genres"
        values={options.genres}
        active={filters.genre}
        onChange={(value) => onFilterChange("genre", value)}
      />
      <FacetSelect
        testId="filter-codec"
        label="Filter by codec"
        allLabel="All codecs"
        values={options.codecs}
        active={filters.codec}
        onChange={(value) => onFilterChange("codec", value)}
      />
      <label className="station-filters__field">
        <span className="sr-only">Sort results</span>
        <select
          value={sort}
          onChange={(event) => onSortChange(event.target.value as StationSort)}
          aria-label="Sort results"
          data-testid="filter-sort"
        >
          {STATION_SORTS.map((value) => (
            <option key={value} value={value}>
              {value === "relevance" ? "Sort: Featured" : SORT_LABELS[value]}
            </option>
          ))}
        </select>
      </label>
      {dirty && (
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
