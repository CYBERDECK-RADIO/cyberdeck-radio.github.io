/**
 * Radio Atlas header: brand lockup, the composite search control, the random
 * tuner, the live-node count, and a ticking UTC clock.
 *
 *   search field + palette ──▶ SearchControl (suggestions, recents, ⌘K)
 *   shuffle button ──▶ onShuffle (disabled while the directory is empty)
 *   pinned shortcut ──▶ onOpenPinned (the kept shelf, straight from the head)
 *   liveNodeCount + clock ──▶ right cluster; the count button opens the list
 */

import { useEffect, useState, type RefObject } from "react";
import { ListMusic, Pin, Shuffle } from "lucide-react";
import { formatUtcClock } from "@/lib/clock";
import type Station from "@/stations/types";
import SearchControl from "./SearchControl";

type AtlasHeaderProps = {
  query: string;
  onQueryChange: (value: string) => void;
  onSearch: (query: string) => void;
  /** Clears the field and the directory the last scan left behind. */
  onClear?: () => void;
  placeholder: string;
  /** Loaded catalog the palette offers suggestions from. */
  stations: readonly Station[];
  /** Picking a suggested station tunes it at once. */
  onSelectStation: (stationId: string, options?: { autoplay?: boolean }) => void;
  liveNodeCount: number;
  onOpenList: () => void;
  /** Opens the directory straight onto the pinned shelf. */
  onOpenPinned: () => void;
  /** How many channels the visitor has pinned, for the shelf shortcut. */
  pinnedCount: number;
  /** Tunes a random station from the current result pool. */
  onShuffle: () => void;
  /** True while nothing is loaded to shuffle through. */
  shuffleDisabled: boolean;
  /** Focus target for "return focus here" flows (Escape in the list drawer). */
  toggleRef?: RefObject<HTMLButtonElement | null>;
};

export default function AtlasHeader({
  query,
  onQueryChange,
  onSearch,
  onClear,
  placeholder,
  stations,
  onSelectStation,
  liveNodeCount,
  onOpenList,
  onOpenPinned,
  pinnedCount,
  onShuffle,
  shuffleDisabled,
  toggleRef,
}: AtlasHeaderProps) {
  const [clock, setClock] = useState(() => formatUtcClock(new Date()));

  useEffect(() => {
    const timer = window.setInterval(() => setClock(formatUtcClock(new Date())), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <header className="atlas-header">
      <div className="atlas-brand" data-testid="brand-cyberdeck-radio">
        <span className="atlas-brand__mark" aria-hidden="true">
          <span className="atlas-brand__pulse" />
        </span>
        <span className="atlas-brand__text">
          <span className="atlas-brand__name">Radio Atlas</span>
          <span className="atlas-brand__tagline">Global atmospheric tuner</span>
        </span>
      </div>

      <SearchControl
        query={query}
        onQueryChange={onQueryChange}
        onSearch={onSearch}
        onClear={onClear}
        placeholder={placeholder}
        stations={stations}
        onSelectStation={onSelectStation}
      />

      <div className="atlas-header__meta">
        <button
          type="button"
          className="atlas-header__shuffle"
          onClick={onShuffle}
          disabled={shuffleDisabled}
          aria-label="Tune a random station"
          title="Tune a random station"
          data-testid="button-shuffle-station"
        >
          <Shuffle aria-hidden="true" />
          <span>Surprise me</span>
        </button>
        <button
          type="button"
          className="atlas-header__pinned"
          onClick={onOpenPinned}
          aria-label="Open pinned channels"
          title="Open pinned channels"
          data-testid="button-open-pinned"
        >
          <Pin aria-hidden="true" />
          <span>Pinned: {pinnedCount}</span>
        </button>
        <button
          type="button"
          className="atlas-header__nodes"
          ref={toggleRef}
          onClick={onOpenList}
          aria-label="Open station list"
          data-testid="button-open-list"
        >
          <ListMusic aria-hidden="true" />
          <span>Live nodes: {liveNodeCount}</span>
        </button>
        <span className="atlas-header__clock" data-testid="text-utc-clock" aria-label="Coordinated universal time">
          Time: {clock} UTC
        </span>
      </div>
    </header>
  );
}
