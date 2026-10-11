/**
 * Cluster picker: the deep-dive fallback for channels too stacked to separate.
 *
 *   crowded cluster click ──▶ anchored panel over the map
 *   filter box ──▶ client-side narrowing of the cluster's own channels
 *   row click  ──▶ onSelect(id, { autoplay: true }) ──▶ lock + tune
 *
 * A co-located city never zooms apart (the crawl pins every channel to one
 * point), so the atlas hands its channels to this panel instead: focus lands
 * on the filter — or the first row when the crowd is small — Escape and
 * outside clicks dismiss it, and focus returns to the bubble that opened it.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { ChevronRight, X } from "lucide-react";
import type Station from "../../stations/types";
import type { HealthStatus } from "../../stations/stream-health-logic";
import { stationLocationLabel } from "../../stations/station-meta";

/** Rows painted before the "Show more" button takes over. */
const PAGE_SIZE = 40;

/** Panel footprint used to keep the anchor inside the canvas. */
const PANEL_WIDTH = 320;
const PANEL_HEIGHT = 360;
const PANEL_MARGIN = 12;

type ClusterPickerProps = {
  stations: Station[];
  /** Heading copy: "84 channels · France". */
  title: string;
  /** Anchor in container pixels — the cluster bubble's screen position. */
  left: number;
  top: number;
  healthById?: ReadonlyMap<string, HealthStatus>;
  onSelect: (stationId: string, options?: { autoplay?: boolean }) => void;
  onClose: () => void;
  /** The cluster element focus falls back to on dismiss. */
  returnFocusRef?: { current: SVGGElement | null };
};

function matchesFilter(station: Station, filter: string): boolean {
  const needle = filter.trim().toLowerCase();
  if (!needle) return true;
  return [station.name, station.city, station.state, station.country]
    .filter(Boolean)
    .some((field) => field!.toLowerCase().includes(needle));
}

export default function ClusterPicker({
  stations,
  title,
  left,
  top,
  healthById,
  onSelect,
  onClose,
  returnFocusRef,
}: ClusterPickerProps) {
  const [filter, setFilter] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const panelRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(
    () => stations.filter((station) => matchesFilter(station, filter)),
    [stations, filter],
  );
  const rows = matches.slice(0, limit);
  const remaining = matches.length - rows.length;

  // A new filter narrows from the top again.
  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [filter]);

  useEffect(() => {
    const list = panelRef.current?.querySelectorAll<HTMLElement>(".cluster-picker__row");
    if (filterRef.current) filterRef.current.focus();
    else list?.[0]?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [onClose]);

  // Dismissal hands focus back to the bubble that opened the panel.
  useEffect(
    () => () => returnFocusRef?.current?.focus(),
    [returnFocusRef],
  );

  function handlePanelKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const list = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(".cluster-picker__row") ?? [],
    );
    if (list.length === 0) return;
    event.preventDefault();
    const current = list.indexOf(document.activeElement as HTMLElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    const next = current === -1 ? 0 : (current + step + list.length) % list.length;
    list[next]?.focus();
  }

  return (
    <div
      className="cluster-picker"
      style={{
        left: `clamp(${PANEL_MARGIN}px, ${left}px, calc(100% - ${PANEL_WIDTH + PANEL_MARGIN}px))`,
        top: `clamp(${PANEL_MARGIN}px, ${top}px, calc(100% - 72px))`,
      }}
      role="dialog"
      aria-label={title}
      data-testid="cluster-picker"
      ref={panelRef}
      onKeyDown={handlePanelKeyDown}
    >
      <div className="cluster-picker__head">
        <span className="cluster-picker__title" data-testid="cluster-picker-title">
          {title}
        </span>
        <button
          type="button"
          className="cluster-picker__close"
          onClick={onClose}
          aria-label="Close channel picker"
          data-testid="button-close-cluster-picker"
        >
          <X aria-hidden="true" />
        </button>
      </div>

      {stations.length > 8 && (
        <input
          type="search"
          className="cluster-picker__filter"
          placeholder="Filter these channels…"
          aria-label="Filter these channels"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          ref={filterRef}
          data-testid="input-cluster-filter"
        />
      )}

      <div className="cluster-picker__list">
        {rows.map((station, index) => {
          const health = healthById?.get(station.id) ?? "unknown";
          return (
            <button
              key={station.id}
              type="button"
              className={`cluster-picker__row health-${health}`}
              aria-label={`${station.name || "Untitled station"}, ${stationLocationLabel(station)}`}
              onClick={() => onSelect(station.id, { autoplay: true })}
              data-testid={`button-cluster-pick-${station.id}`}
            >
              <span className="cluster-picker__index">{String(index + 1).padStart(2, "0")}</span>
              <span className="cluster-picker__info">
                <span className="cluster-picker__name">{station.name || "Untitled station"}</span>
                <span className="cluster-picker__place">{stationLocationLabel(station)}</span>
              </span>
              <ChevronRight className="cluster-picker__go" aria-hidden="true" />
            </button>
          );
        })}
        {rows.length === 0 && (
          <p className="cluster-picker__empty" data-testid="cluster-picker-empty">
            No channel here matches “{filter}”.
          </p>
        )}
      </div>

      {remaining > 0 && (
        <button
          type="button"
          className="cluster-picker__more"
          onClick={() => setLimit((value) => value + PAGE_SIZE)}
          data-testid="button-cluster-picker-more"
        >
          Show {Math.min(PAGE_SIZE, remaining)} more of {remaining.toLocaleString("en-US")} left
        </button>
      )}
    </div>
  );
}
