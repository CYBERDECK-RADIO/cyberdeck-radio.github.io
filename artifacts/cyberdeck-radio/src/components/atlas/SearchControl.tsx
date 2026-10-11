/**
 * Composite search control: one field that is also a palette.
 *
 *   ┌ field ───────────────────────────────────────┐
 *   │ ⌕  query                          ⌘K   Scan │
 *   └──────────────────────────────────────────────┘
 *        └ palette: Recent · Stations · Countries · Cities · Genres · Scan
 *
 *   focus / ⌘K / “/” ──▶ palette opens
 *   query ─(150ms)──▶ buildSearchSuggestions(stations, q) ──▶ grouped rows
 *   ↑ ↓ walk the rows · Enter activates (or scans) · Esc closes
 *   station row ──▶ onSelectStation(id, { autoplay: true })
 *   term row    ──▶ onSearch(term) + remembered for next time
 *
 * The palette never owns the catalog: it points into it. Stations tune at
 * once; countries, cities, genres, and recents hand their term to the same
 * directory scan the field always ran, and every remembered term is stored
 * through the recent-searches blob.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Clock3, CornerDownLeft, MapPin, Music2, Radio, Search, X } from "lucide-react";
import { isEditableTarget } from "@/lib/shortcuts";
import type Station from "../../stations/types";
import {
  buildSearchSuggestions,
  type SearchSuggestion,
} from "../../stations/search-suggestions";
import {
  loadRecentSearches,
  rememberSearch,
  saveRecentSearches,
} from "../../stations/recent-searches";

/** Keystrokes the palette waits out so a 38k-channel scan stays off the typing path. */
const SUGGESTION_DEBOUNCE_MS = 150;

type OptionKind = SearchSuggestion["kind"] | "recent" | "scan";

type PaletteOption = {
  index: number;
  id: string;
  kind: OptionKind;
  label: string;
  detail?: string;
  query: string;
  stationId?: string;
};

type PaletteGroup = {
  key: string;
  label: string;
  options: PaletteOption[];
};

const KIND_ICONS: Record<OptionKind, typeof Clock3> = {
  recent: Clock3,
  station: Radio,
  country: MapPin,
  city: MapPin,
  genre: Music2,
  scan: CornerDownLeft,
};

const GROUP_LABELS: Record<Exclude<SearchSuggestion["kind"], never>, string> = {
  station: "Stations",
  country: "Countries",
  city: "Cities",
  genre: "Genres",
};

type SearchControlProps = {
  query: string;
  onQueryChange: (value: string) => void;
  onSearch: (query: string) => void;
  /** Clears the field *and* whatever the last scan left behind. */
  onClear?: () => void;
  placeholder: string;
  /** The loaded catalog the palette offers suggestions from. */
  stations: readonly Station[];
  onSelectStation: (stationId: string, options?: { autoplay?: boolean }) => void;
};

function optionIcon(kind: OptionKind) {
  const Icon = KIND_ICONS[kind];
  return <Icon aria-hidden="true" />;
}

export default function SearchControl({
  query,
  onQueryChange,
  onSearch,
  onClear,
  placeholder,
  stations,
  onSelectStation,
}: SearchControlProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const [recents, setRecents] = useState<string[]>(() => loadRecentSearches());
  const inputRef = useRef<HTMLInputElement>(null);

  const shortcutLabel = useMemo(() => {
    const platform = typeof navigator === "undefined" ? "" : navigator.platform || "";
    return /Mac|iPhone|iPad|iPod/.test(platform) ? "⌘K" : "Ctrl K";
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedQuery(query),
      SUGGESTION_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [query]);

  // ⌘K/Ctrl-K from anywhere, "/" when nothing else is typing. Both stand down
  // while the chrome is hidden (zen, screen saver) so the field stays honest.
  useEffect(() => {
    const focusPalette = () => {
      if (document.querySelector(".app.is-zen, .app.is-screensaver")) return;
      inputRef.current?.focus();
      setOpen(true);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        focusPalette();
        return;
      }
      if (
        event.key === "/" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !isEditableTarget(document.activeElement)
      ) {
        event.preventDefault();
        focusPalette();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const { groups, options } = useMemo(() => {
    type RawOption = Omit<PaletteOption, "index">;
    const built = buildSearchSuggestions(stations, debouncedQuery);
    const raw: { key: string; label: string; options: RawOption[] }[] = [];
    const needle = debouncedQuery.trim().toLowerCase();

    const recentOptions = recents
      .filter((term) => !needle || term.toLowerCase().includes(needle))
      .map((term) => ({
        id: `recent:${term.toLowerCase()}`,
        kind: "recent" as const,
        label: term,
        query: term,
      }));
    if (recentOptions.length > 0) {
      raw.push({ key: "recent", label: "Recent", options: recentOptions });
    }

    for (const kind of ["station", "country", "city", "genre"] as const) {
      const matches = built
        .filter((suggestion) => suggestion.kind === kind)
        .map((suggestion) => ({ ...suggestion }));
      if (matches.length > 0) {
        raw.push({ key: kind, label: GROUP_LABELS[kind], options: matches });
      }
    }

    const term = query.trim();
    if (term) {
      raw.push({
        key: "scan",
        label: "Search",
        options: [
          {
            id: "scan",
            kind: "scan",
            label: `Scan “${term}”`,
            detail: "Search the whole directory",
            query: term,
          },
        ],
      });
    }

    const flat: PaletteOption[] = [];
    const groupsOut: PaletteGroup[] = raw.map((group) => ({
      ...group,
      options: group.options.map((option) => {
        const indexed = { ...option, index: flat.length };
        flat.push(indexed);
        return indexed;
      }),
    }));
    return { groups: groupsOut, options: flat };
  }, [stations, debouncedQuery, recents, query]);

  function remember(term: string) {
    setRecents((current) => {
      const next = rememberSearch(current, term);
      saveRecentSearches(next);
      return next;
    });
  }

  function closePalette() {
    setOpen(false);
    setActiveIndex(-1);
  }

  function activate(option: PaletteOption) {
    closePalette();
    if (option.kind === "station" && option.stationId) {
      onSelectStation(option.stationId, { autoplay: true });
      return;
    }
    const term = option.query.trim();
    if (!term) return;
    onQueryChange(term);
    remember(term);
    onSearch(term);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = query.trim();
    closePalette();
    if (!term) return;
    remember(term);
    onSearch(term);
  }

  function handleClear() {
    onQueryChange("");
    onClear?.();
    closePalette();
    inputRef.current?.focus();
  }

  function handleInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      if (!open) return;
      event.preventDefault();
      event.stopPropagation();
      closePalette();
      return;
    }
    if (!open) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (options.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => {
        if (current === -1) return step === 1 ? 0 : options.length - 1;
        return (current + step + options.length) % options.length;
      });
      return;
    }
    if (event.key === "Enter" && activeIndex >= 0) {
      const option = options[activeIndex];
      if (option) {
        event.preventDefault();
        activate(option);
      }
    }
  }

  // Keep the highlighted row on screen while the field holds focus.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    document
      .getElementById(`palette-option-${activeIndex}`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [open, activeIndex, options]);

  return (
    <div
      className="atlas-search-shell"
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (next && event.currentTarget.contains(next)) return;
        closePalette();
      }}
    >
      <form
        className="atlas-search"
        onSubmit={handleSubmit}
        role="search"
        data-testid="form-station-search"
      >
        <Search aria-hidden="true" />
        <input
          type="search"
          role="combobox"
          value={query}
          onChange={(event) => {
            onQueryChange(event.target.value);
            setActiveIndex(-1);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleInputKeyDown}
          placeholder={placeholder}
          aria-label="Search radio stations"
          aria-expanded={open}
          aria-controls="search-palette"
          aria-autocomplete="list"
          aria-activedescendant={
            open && activeIndex >= 0 ? `palette-option-${activeIndex}` : undefined
          }
          data-testid="input-station-search"
          ref={inputRef}
        />
        {query && (
          <button
            type="button"
            className="atlas-search__clear"
            aria-label="Clear search"
            data-testid="button-clear-search"
            onClick={handleClear}
          >
            <X aria-hidden="true" />
          </button>
        )}
        <kbd className="atlas-search__kbd" aria-hidden="true">
          {shortcutLabel}
        </kbd>
        <button
          type="submit"
          className="atlas-search__submit"
          data-testid="button-search-stations"
        >
          Scan
        </button>
      </form>

      {open && (
        <div
          className="atlas-search__palette"
          id="search-palette"
          role="listbox"
          aria-label="Search suggestions"
          data-testid="search-palette"
          onMouseDown={(event) => event.preventDefault()}
        >
          {groups.map((group) => (
            <div
              className="atlas-search__group"
              role="group"
              aria-label={group.label}
              key={group.key}
            >
              <span className="atlas-search__group-label" role="presentation">
                {group.label}
              </span>
              {group.options.map((option) => (
                <button
                  type="button"
                  key={option.id}
                  id={`palette-option-${option.index}`}
                  role="option"
                  aria-selected={option.index === activeIndex}
                  className={`atlas-search__option${
                    option.index === activeIndex ? " is-active" : ""
                  }`}
                  tabIndex={-1}
                  onClick={() => activate(option)}
                  data-testid={`palette-option-${option.kind}-${option.index}`}
                >
                  <span className="atlas-search__option-icon">{optionIcon(option.kind)}</span>
                  <span className="atlas-search__option-copy">
                    <span className="atlas-search__option-label">{option.label}</span>
                    {option.detail && (
                      <span className="atlas-search__option-detail">{option.detail}</span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          ))}
          {options.length === 0 && (
            <p className="atlas-search__empty" data-testid="search-palette-empty">
              {stations.length === 0
                ? "The directory is empty — press Enter to scan anyway."
                : query.trim()
                  ? "No suggestions — press Enter to scan for it."
                  : "Type a city, country, genre, or station name."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
