/**
 * Radio Atlas — a full-screen stylized world with a floating player dossier.
 *
 *   layout: header → map canvas (world + dossier) → frequency ruler
 *     header:  brand, search field + suggestion palette, live-node count, UTC clock
 *     canvas:  full-bleed vector world with station pips (the hero)
 *     dossier: the only transport surface — identity, status, meter, volume
 *     ruler:   synthetic FM band; drag it to lock the nearest carrier
 *     list:    a slide-over directory (filters, saved shelves, rows)
 *     dock:    view modes — zen (chrome off) and screen saver (atlas asleep)
 *
 * query ──▶ radio-browser ──▶ Station[] ──▶ filters ──▶ list + pips + ruler
 *                                              │  select
 *                                              ▼
 * selectedStation ──▶ AudioController ──▶ PlaybackState ──▶ dossier
 *                        ▲  play/pause/stop/volume (user actions)
 *                        └── error ──▶ retry via play again
 *
 * stations + query ──▶ search palette (stations / places / genres / recents)
 * stillness ──▶ useScreensaver ──▶ overlay; any deliberate input wakes it
 *
 * The shell owns selection; the controller owns playback. Picking a channel (a
 * list row or a map pip) locks it and plays at once; a pan or a dial drag only
 * locks the nearest station so exploring stays quiet.
 */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createAudioController } from '@/audio/audio-controller';
import { createMetadata, getMediaSession, syncMediaSession } from '@/audio/media-session';
import { createCaptureAnalyser } from '@/audio/visualizer';
import AtlasHeader from '@/components/atlas/AtlasHeader';
import AtlasWorld from '@/components/atlas/AtlasWorld';
import DossierCard from '@/components/atlas/DossierCard';
import FrequencyRuler from '@/components/atlas/FrequencyRuler';
import ModeDock from '@/components/atlas/ModeDock';
import ScreensaverOverlay from '@/components/atlas/ScreensaverOverlay';
import ShaderBackdrop from '@/components/atlas/ShaderBackdrop';
import BackdropArt from '@/components/atlas/theme/BackdropArt';
import { describeStageCaption } from '@/components/stage-caption';
import { ErrorBoundary } from '@/components/error-boundary';
import StationFilters from '@/components/StationFilters';
import { useScreensaver } from '@/modes/use-screensaver';
import { useSleepTimer } from '@/modes/use-sleep-timer';
import NotFound from '@/pages/not-found';
import { usePreferences } from '@/preferences/use-preferences';
import { useThemeCues } from '@/preferences/use-theme-cues';
import { getThemeDefinition } from '@/preferences/themes';
import {
  EMPTY_FILTERS,
  collectFilterOptions,
  filterStations,
  hasActiveFilters,
  sortStations,
  stationMatchesQuery,
  type StationFilters as StationFiltersState,
  type StationSort,
} from '@/stations/filter-stations';
import { findClosestLocaleStation, getLocaleCountryCode } from '@/stations/locale-channel';
import { pickRandomStation } from '@/stations/random-station';
import { getGardenCatalogInfo, type GardenCatalogInfo } from '@/stations/radio-garden';
import { recordChannel, resetRecentChannels } from '@/stations/recent-channels';
import { hasSecureStream } from '@/stations/secure-stream';
import { CATALOG_CREDITS, getStations } from '@/stations/sources';
import { registerStations } from '@/stations/stream-health';
import { togglePinnedChannel } from '@/stations/pinned-channels';
import { useStationHealth } from '@/stations/use-station-health';
import { usePinnedChannels } from '@/stations/use-pinned-channels';
import { useQuarantine } from '@/stations/use-quarantine';
import { useRecentChannels } from '@/stations/use-recent-channels';
import { stationLocationLabel } from '@/stations/station-meta';
import type Station from '@/stations/types';
import { isEditableTarget, isMapTarget, matchShortcut, ownsSpaceActivation } from '@/lib/shortcuts';
import { buildStationLink, parseStationIdFromSearch, withStationParam } from '@/lib/share-link';
import { AudioLines, History, Pin, Signal, Star, WifiOff, X } from 'lucide-react';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

/** Rows drawn per page: a 38k-channel crawl must never render 38k buttons. */
const DIRECTORY_PAGE_SIZE = 60;

/**
 * Which pool the directory is showing: the live source (`all`), the pinned
 * shelf, or the dial log. The shelf views render from stored snapshots, so
 * they work before any catalog arrives and across source switches.
 */
type DirectoryShelf = 'all' | 'pinned' | 'recent';

/** Floor for a mute-unmute when the last audible level is unknown. */
const FALLBACK_VOLUME = 0.8;

const STAMP_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** "11 Oct 2026, 04:23 UTC" — proof the scheduled crawl actually ran. */
function formatCatalogStamp(iso: string | null): string {
  if (!iso) return 'date unknown';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'date unknown';
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${pad(date.getUTCDate())} ${STAMP_MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}, ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`
  );
}

function Home() {
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [stations, setStations] = useState<Station[]>([]);
  const [allStations, setAllStations] = useState<Station[]>([]);
  const [searchMatchedStations, setSearchMatchedStations] = useState<Station[]>([]);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  /** Latches once the first-visit lock has been decided (see the effect below). */
  const [visitResolved, setVisitResolved] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'empty' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [filters, setFilters] = useState<StationFiltersState>(EMPTY_FILTERS);
  const [sort, setSort] = useState<StationSort>('relevance');
  const [listOpen, setListOpen] = useState(false);
  const [listLimit, setListLimit] = useState(DIRECTORY_PAGE_SIZE);
  const [catalogInfo, setCatalogInfo] = useState<GardenCatalogInfo | null>(null);
  const [zen, setZen] = useState(false);
  const [shelf, setShelf] = useState<DirectoryShelf>('all');
  const [shareState, setShareState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const latestRequest = useRef(0);
  const wantsListRef = useRef(false);
  const listToggleRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLElement>(null);
  const [controller] = useState(() => createAudioController({ createAnalyser: createCaptureAnalyser }));
  const playback = useSyncExternalStore(controller.subscribe, controller.getState);
  const { volume, setVolume, theme, setTheme, cycleTheme, soundCues, toggleSoundCues } =
    usePreferences();
  useThemeCues(theme, soundCues);
  /** What an unmute should restore — the slider remembers, not the mute. */
  const lastAudibleVolumeRef = useRef(volume > 0 ? volume : FALLBACK_VOLUME);
  const healthById = useStationHealth();
  const offlineIds = useQuarantine();
  const pinnedStations = usePinnedChannels();
  const recentStations = useRecentChannels();
  const sleep = useSleepTimer({ onExpire: () => controller.stop() });
  // A ?station= deep link waits for a catalog (or the local shelves) to hold it.
  const deepLinkRef = useRef<string | null | undefined>(undefined);
  if (deepLinkRef.current === undefined) {
    deepLinkRef.current = parseStationIdFromSearch(window.location.search);
  }
  /** Set when the deep link wins the first lock, so the visit restore stands down. */
  const deepLinkLockedRef = useRef(false);
  /** One-shot latch for the first-visit restore/closest-locale decision. */
  const visitResolvedRef = useRef(false);
  /** The visitor's locale country, read once from the browser. */
  const [localeCountry] = useState(() => getLocaleCountryCode());
  // The saver only dozes off while the directory is shut; waking is always live.
  const { engaged: screensaver, engage: engageScreensaver, release: wakeScreensaver } =
    useScreensaver({ enabled: !listOpen });

  useEffect(() => () => controller.dispose(), [controller]);

  useEffect(() => {
    controller.setVolume(volume);
  }, [controller, volume]);

  useEffect(() => {
    const session = getMediaSession();
    if (!session) return;
    syncMediaSession(session, {
      station: selectedStation,
      playback,
      createMetadata: createMetadata(),
      actions: {
        play: () => {
          if (selectedStation) void controller.play(selectedStation);
        },
        pause: () => controller.pause(),
        stop: () => controller.stop(),
      },
    });
  }, [controller, selectedStation, playback]);

  // Remember the last audible level so mute is a detour, not a dead end.
  useEffect(() => {
    if (volume > 0) lastAudibleVolumeRef.current = volume;
  }, [volume]);

  // Anything the deck actually starts playing joins the dial log, so the
  // "Recent" shelf fills itself without the visitor ever opening a menu.
  useEffect(() => {
    if (!selectedStation) return;
    if (playback.status === 'loading' || playback.status === 'playing') {
      recordChannel(selectedStation);
    }
  }, [playback.status, selectedStation]);

  // "Link copied" (or its honest failure) fades back to the plain control.
  useEffect(() => {
    if (shareState === 'idle') return;
    const timer = window.setTimeout(() => setShareState('idle'), 2_000);
    return () => window.clearTimeout(timer);
  }, [shareState]);

  // A shared link locks its channel once a catalog (or a local shelf) holds it.
  // The lock never starts audio: browsers only accept that from a real gesture.
  useEffect(() => {
    const wanted = deepLinkRef.current;
    if (!wanted) return;
    const found =
      stations.find((item) => item.id === wanted) ??
      pinnedStations.find((item) => item.id === wanted) ??
      recentStations.find((item) => item.id === wanted);
    if (found) {
      setSelectedStation(found);
      deepLinkRef.current = null;
      deepLinkLockedRef.current = true;
      setVisitResolved(true);
      return;
    }
    if (status === 'success' || status === 'empty') deepLinkRef.current = null;
  }, [stations, pinnedStations, recentStations, status]);

  // Receiver keyboard: space, mute, pin, and channel hops from anywhere. It
  // stands down for typing, for controls that own their own Space, for the
  // map's arrow panning, and while the screen saver is engaged (waking it is
  // the saver's business; its own transport already steers playback).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (screensaver) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const action = matchShortcut(event);
      if (!action) return;
      if (isEditableTarget(event.target)) return;

      if (action === 'toggle-play') {
        if (ownsSpaceActivation(event.target)) return;
        event.preventDefault();
        togglePlayback();
        return;
      }
      if (action === 'hop-prev' || action === 'hop-next') {
        if (isMapTarget(event.target)) return;
        event.preventDefault();
        handleHop(action === 'hop-next' ? 1 : -1);
        return;
      }
      if (action === 'pin') {
        if (!selectedStation) return;
        togglePinnedChannel(selectedStation);
        return;
      }
      if (action === 'mute') toggleMute();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  });

  useEffect(() => {
    const aborter = new AbortController();
    const requestId = ++latestRequest.current;
    setStatus('loading');
    getStations({ signal: aborter.signal })
      .then((results) => {
        if (aborter.signal.aborted || requestId !== latestRequest.current) return;
        setAllStations(results);
        setStations(results);
        setStatus(results.length ? 'success' : 'empty');
        setCatalogInfo(getGardenCatalogInfo());
      })
      .catch((error: unknown) => {
        if (aborter.signal.aborted || requestId !== latestRequest.current) return;
        if (allStations.length === 0) {
          setErrorMessage('');
          setStatus('idle');
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : 'The station directory could not be reached.');
        setStatus('error');
      });
    return () => aborter.abort();
  }, [attempt]);

  // Clearing the scan drops the lock with the results, so the deck, the map, and
  // the audio never disagree about what is playing. Keyed to the query alone:
  // also keying it to the catalog would re-run it the moment a fresh load lands
  // and wipe the atlas's first auto-lock.
  useEffect(() => {
    if (submittedQuery.trim()) return;
    setSelectedStation(null);
    setFilters(EMPTY_FILTERS);
    setSort('relevance');
    setErrorMessage('');
    setSearchMatchedStations([]);
  }, [submittedQuery]);

  useEffect(() => {
    if (!submittedQuery.trim()) {
      setStations(allStations);
      return;
    }
    const matches = allStations.filter((station) => stationMatchesQuery(station, submittedQuery));
    setStations(matches);
    setSearchMatchedStations(matches);
    setStatus(matches.length ? 'success' : 'empty');
  }, [submittedQuery, allStations]);

  // Only probeable channels join the health pool: the crawled Radio Garden
  // catalog is geotagged HTTPS listen URLs with nothing to poll, so registering
  // all 38k of them would only feed the worker dead weight. Quarantined
  // (confirmed-offline) channels stay registered too — the worker's slow sweep
  // is what notices their stream coming back and puts the record on screen.
  const probedStations = useMemo(
    () => stations.filter((station) => station.checkUrl),
    [stations],
  );

  useEffect(() => {
    registerStations(probedStations);
  }, [probedStations]);

  // The directory slides open when the visitor asked for something — a scan, a
  // source switch, a retry. A cold catalog load leaves the atlas unobstructed.
  // Keyed to the query as well as the status: a fresh scan re-filters an
  // already-loaded catalog, so the status can stay put while results change.
  useEffect(() => {
    if (status !== 'success' && status !== 'empty' && status !== 'error') return;
    if (!wantsListRef.current) return;
    wantsListRef.current = false;
    setListOpen(true);
  }, [status, submittedQuery]);

  // Picking a facet, sorting, scanning, or switching shelves starts a fresh page of rows.
  useEffect(() => {
    setListLimit(DIRECTORY_PAGE_SIZE);
  }, [submittedQuery, filters, sort, shelf]);

  // Drawer hygiene: Escape closes it (focus returns to the toggle), the page
  // behind it is scroll-locked, and focus is contained while it is open.
  useEffect(() => {
    if (!listOpen) return;
    const container = listRef.current;
    container?.querySelector<HTMLButtonElement>('.list-drawer__close')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setListOpen(false);
        listToggleRef.current?.focus();
        return;
      }
      if (event.key !== 'Tab' || !container) return;
      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.getClientRects().length > 0);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [listOpen]);

  // Zen mode: Escape restores the chrome. The drawer can never be open here
  // (entering zen shuts it), and the screen saver swallows its own wake key.
  useEffect(() => {
    if (!zen || screensaver) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setZen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [zen, screensaver]);

  function handleSearch(nextQuery: string) {
    if (!nextQuery) return;
    wantsListRef.current = true;
    // A scan asks for the catalog, not the saved shelves.
    setShelf('all');
    if (nextQuery === submittedQuery) setAttempt((value) => value + 1);
    else setSubmittedQuery(nextQuery);
  }

  function retrySearch() {
    wantsListRef.current = true;
    setAttempt((value) => value + 1);
  }

  /** Wipe the field and the directory the last scan left behind. */
  function handleClearSearch() {
    setQuery('');
    setSubmittedQuery('');
    setListOpen(false);
    // The reset effect drops the lock with the results; stop so the deck,
    // the map, and the audio never disagree about what is playing.
    controller.stop();
  }

  /** Point the address bar at the tuned channel, in place, so it is copyable. */
  function syncStationLink(station: Station) {
    try {
      const next =
        window.location.pathname +
        withStationParam(window.location.search, station.id) +
        window.location.hash;
      window.history.replaceState(window.history.state, '', next);
    } catch {
      // Sandboxed history: the share button still builds its own link.
    }
  }

  function handleSelectStation(stationId: string, options?: { autoplay?: boolean }) {
    // Deliberate picks come from the rows and pips on screen; a shelf pick
    // lives in its snapshots rather than the loaded catalog.
    const station =
      visibleStations.find((item) => item.id === stationId) ??
      stations.find((item) => item.id === stationId);
    if (!station) return;
    const isChannelChange = station.id !== selectedStation?.id;
    setSelectedStation(station);
    if (isChannelChange && options?.autoplay) {
      cycleTheme();
    }
    if (options?.autoplay) {
      syncStationLink(station);
      void controller.play(station);
      setListOpen(false);
    }
  }

  function handleDial(stationId: string) {
    handleSelectStation(stationId, { autoplay: true });
  }

  function handleFilterChange(facet: keyof StationFiltersState, value: string | null) {
    setFilters((current) => {
      const next = { ...current, [facet]: value };
      // Picking a place drops the finer place facets that no longer line up.
      if (facet === 'country') {
        next.state = null;
        next.city = null;
      } else if (facet === 'state') {
        next.city = null;
      }
      return next;
    });
  }

  function handleClearFilters() {
    setFilters(EMPTY_FILTERS);
    setSort('relevance');
  }

  function handleShuffle() {
    const pool = visibleStations.length > 0 ? visibleStations : usableStations;
    const station = pickRandomStation(pool, { excludeId: selectedStation?.id ?? null });
    if (!station) return;
    const isChannelChange = station.id !== selectedStation?.id;
    setSelectedStation(station);
    if (isChannelChange) {
      cycleTheme();
    }
    syncStationLink(station);
    void controller.play(station);
    // Reveal what got picked: the drawer shows the row and scrolls it into view.
    setListOpen(true);
  }

  /** Switch the directory between the live source and the saved shelves. */
  function handleShelfChange(next: DirectoryShelf) {
    setShelf(next);
    setFilters(EMPTY_FILTERS);
    setSort('relevance');
    setListOpen(true);
  }

  /** Pin/unpin from the dossier, a row, or the `p` shortcut. */
  function handleTogglePin(station: Station | null) {
    if (!station) return;
    togglePinnedChannel(station);
  }

  function toggleMute() {
    if (volume > 0) {
      lastAudibleVolumeRef.current = volume;
      setVolume(0);
      return;
    }
    setVolume(lastAudibleVolumeRef.current > 0 ? lastAudibleVolumeRef.current : FALLBACK_VOLUME);
  }

  /** Copy a shareable link to the tuned channel; the read-out fades itself. */
  function handleShare() {
    if (!selectedStation) return;
    const link = buildStationLink(
      selectedStation.id,
      window.location.origin + window.location.pathname,
    );
    if (!navigator.clipboard?.writeText) {
      setShareState('failed');
      return;
    }
    navigator.clipboard.writeText(link).then(
      () => setShareState('copied'),
      () => setShareState('failed'),
    );
  }

  function toggleZen() {
    setZen((value) => !value);
    setListOpen(false);
  }

  function beginScreensaver() {
    setListOpen(false);
    engageScreensaver();
  }

  const showingShelf = shelf !== 'all';

  /**
   * The pool the directory, facets, map, ruler, and hops read: the loaded
   * catalog, or — while a shelf is open — the stored snapshots of pinned and
   * recently played channels (which need no catalog at all).
   */
  const baseStations = useMemo<Station[]>(() => {
    if (shelf === 'pinned') return [...pinnedStations];
    if (shelf === 'recent') return [...recentStations];
    return stations;
  }, [shelf, stations, pinnedStations, recentStations]);

  const mapBaseStations = useMemo<Station[]>(() => {
    if (shelf === 'pinned') return [...pinnedStations];
    if (shelf === 'recent') return [...recentStations];
    return allStations;
  }, [shelf, allStations, pinnedStations, recentStations]);

  const pinnedIds = useMemo(
    () => new Set(pinnedStations.map((station) => station.id)),
    [pinnedStations],
  );

  const filterOptions = useMemo(
    () => collectFilterOptions(baseStations, filters),
    [baseStations, filters],
  );
  const usableStations = useMemo(
    () =>
      baseStations
        .filter(hasSecureStream)
        .filter((station) => healthById.get(station.id) !== 'insecure')
        // Channels the worker confirmed offline sit in the local quarantine
        // cache; they rejoin the records automatically once a slow re-probe
        // reports the stream live again.
        .filter((station) => !offlineIds.has(station.id)),
    [baseStations, healthById, offlineIds],
  );
  const usableMapStations = useMemo(
    () =>
      mapBaseStations
        .filter(hasSecureStream)
        .filter((station) => healthById.get(station.id) !== 'insecure')
        .filter((station) => !offlineIds.has(station.id)),
    [mapBaseStations, healthById, offlineIds],
  );
  const visibleStations = useMemo(
    () => sortStations(filterStations(usableStations, filters), sort),
    [usableStations, filters, sort],
  );

  const matchedStations = useMemo<Station[]>(
    () => {
      if (!submittedQuery.trim()) return [];
      return allStations.filter((station) => stationMatchesQuery(station, submittedQuery));
    },
    [allStations, submittedQuery],
  );
  const matchedIds = useMemo(
    () => new Set(matchedStations.map((station) => station.id)),
    [matchedStations],
  );

  // A first visit restores whatever this browser last tuned. When that channel
  // has left the directory (or was pruned as offline/insecure), the deck falls
  // back to the closest channel in the visitor's locale country, then to the
  // saved snapshot if the catalog never arrived at all. The decision is made
  // once, after the catalog settles, and never overrides a shared ?station=
  // link or an explicit pick; until it is made the map's own nearest-centre
  // lock stays off so the two never race for the dossier.
  useEffect(() => {
    if (visitResolvedRef.current) return;
    if (status !== 'success' && status !== 'empty') return;
    if (deepLinkLockedRef.current || deepLinkRef.current) return;
    visitResolvedRef.current = true;
    setVisitResolved(true);
    if (selectedStation) return;

    const lastVisited = recentStations[0] ?? null;
    const freshLastVisited = lastVisited
      ? usableStations.find((station) => station.id === lastVisited.id) ?? null
      : null;
    const target =
      freshLastVisited ??
      findClosestLocaleStation(usableStations, localeCountry) ??
      (status === 'empty' ? lastVisited : null);
    if (!target) return;

    setSelectedStation(target);
    void controller.play(target);
  }, [status, recentStations, usableStations, selectedStation, localeCountry, controller]);

  // Focus the first matched station when a search returns matches and nothing is locked yet.
  useEffect(() => {
    if (!submittedQuery.trim()) return;
    if (selectedStation) return;
    if (matchedStations.length === 0) return;
    const first = matchedStations[0] as unknown as Station;
    if (first) {
      setSelectedStation(first as Station);
    }
  }, [submittedQuery, matchedStations, selectedStation]);

  // Keep the list in sync with the map: when a station is locked, page its row
  // into the rendered slice and bring it into view while the drawer is open.
  useEffect(() => {
    if (!selectedStation || !listOpen) return;
    const index = visibleStations.findIndex((item) => item.id === selectedStation.id);
    if (index >= listLimit) {
      setListLimit(Math.ceil((index + 1) / DIRECTORY_PAGE_SIZE) * DIRECTORY_PAGE_SIZE);
      return;
    }
    if (index < 0) return;
    const id =
      typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? CSS.escape(selectedStation.id)
        : selectedStation.id;
    const node = document.querySelector<HTMLElement>(`[data-testid="button-select-station-${id}"]`);
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedStation, listOpen, visibleStations, listLimit]);

  /** The channels the hop controls walk: current results, else the directory. */
  const hopPool = visibleStations.length > 0 ? visibleStations : usableStations;

  /** One page of rows — the atlas carries the full catalog, not the DOM. */
  const pageStations = visibleStations.slice(0, listLimit);

  /** Channel hop: step through the result set and tune each stop as it goes. */
  function handleHop(direction: -1 | 1) {
    if (hopPool.length < 2) return;
    const currentIndex = selectedStation
      ? hopPool.findIndex((item) => item.id === selectedStation.id)
      : -1;
    const nextIndex =
      currentIndex === -1
        ? direction === 1
          ? 0
          : hopPool.length - 1
        : (currentIndex + direction + hopPool.length) % hopPool.length;
    const next = hopPool[nextIndex];
    if (!next) return;
    const isChannelChange = next.id !== selectedStation?.id;
    setSelectedStation(next);
    if (isChannelChange) {
      cycleTheme();
    }
    syncStationLink(next);
    void controller.play(next);
  }

  // A station that turns out to have no secure stream — or whose stream the
  // worker confirmed dead — is pruned from the records; drop it from the
  // dossier too and stop playback so the deck never points at a dead channel.
  useEffect(() => {
    if (!selectedStation) return;
    if (
      healthById.get(selectedStation.id) === 'insecure' ||
      offlineIds.has(selectedStation.id)
    ) {
      setSelectedStation(null);
      controller.stop();
    }
  }, [healthById, offlineIds, selectedStation, controller]);

  const isTuning = playback.status === 'playing' || playback.status === 'loading';

  function togglePlayback() {
    if (!selectedStation) return;
    if (isTuning) controller.pause();
    else void controller.play(selectedStation);
  }

  const listingTitle = submittedQuery === '' ? 'Signals from every catalog' : `Signals for “${submittedQuery}”`;
  const placeholderTitle = 'Browse the airwaves';

  /** A shelf renders from stored snapshots, so it never waits on `status`. */
  const listReady = showingShelf || status === 'success';
  const shelfEmpty = showingShelf && usableStations.length === 0 && !hasActiveFilters(filters);
  const shelfCopy =
    shelf === 'pinned'
      ? {
          kicker: 'Kept for later',
          heading: `${usableStations.length.toLocaleString('en-US')} pinned channel${usableStations.length === 1 ? '' : 's'}`,
          title: 'No pinned channels yet.',
          body: 'Pin a channel from the deck or the directory — the star keeps it here across reloads and source switches.',
        }
      : {
          kicker: 'The dial log',
          heading: `${usableStations.length.toLocaleString('en-US')} recently played`,
          title: 'Nothing in the dial log yet.',
          body: 'Channels you tune show up here automatically, newest first, so yesterday’s find is one click away.',
        };

  const stageCaption = describeStageCaption({
    playback,
    selectedStation,
    submittedQuery,
    visibleCount: visibleStations.length,
  });
  const captionNode = (
    <>
      {stageCaption.map((segment, index) =>
        segment.strong ? (
          <strong key={index}>{segment.text}</strong>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );

  return (
    <main
      className={`app${zen ? ' is-zen' : ''}${screensaver ? ' is-screensaver' : ''}`}
      data-testid="page-radio-explorer"
    >
      <a className="skip-link" href="#player">Skip to player</a>

      <AtlasHeader
        query={query}
        onQueryChange={setQuery}
        onSearch={handleSearch}
        onClear={handleClearSearch}
        placeholder="Search city, frequency, callsign…"
        stations={stations}
        onSelectStation={handleSelectStation}
        liveNodeCount={usableStations.length}
        onOpenList={() => setListOpen(true)}
        onOpenPinned={() => handleShelfChange('pinned')}
        pinnedCount={pinnedStations.length}
        onShuffle={handleShuffle}
        shuffleDisabled={usableStations.length === 0}
        toggleRef={listToggleRef}
      />

      <div className="atlas-canvas">
        <ShaderBackdrop theme={theme} />
        <BackdropArt art={getThemeDefinition(theme).art} />

        <ModeDock
          zen={zen}
          onToggleZen={toggleZen}
          onStartScreensaver={beginScreensaver}
          theme={theme}
          onSelectTheme={setTheme}
          soundCues={soundCues}
          onToggleSoundCues={toggleSoundCues}
        />

        <AtlasWorld
          stations={usableMapStations}
          selectedStationId={selectedStation?.id ?? null}
          autoLockEnabled={visitResolved}
          healthById={healthById}
          pinnedIds={pinnedIds}
          matchedIds={matchedIds}
          theme={theme}
          onSelectStation={handleSelectStation}
        />

        <div className="atlas-canvas__dossier">
          <DossierCard
            station={selectedStation}
            playback={playback}
            volume={volume}
            muted={volume === 0}
            health={selectedStation ? healthById.get(selectedStation.id) ?? 'unknown' : 'unknown'}
            analyser={controller.getAnalyser()}
            playing={playback.status === 'playing'}
            caption={captionNode}
            canHop={hopPool.length > 1}
            pinned={selectedStation ? pinnedIds.has(selectedStation.id) : false}
            shareState={shareState}
            sleep={sleep}
            onHop={handleHop}
            onTogglePlayback={togglePlayback}
            onStop={() => controller.stop()}
            onVolumeChange={setVolume}
            onToggleMute={toggleMute}
            onTogglePin={() => handleTogglePin(selectedStation)}
            onShare={handleShare}
            onArmSleep={sleep.arm}
            onCancelSleep={sleep.cancel}
          />
        </div>
      </div>

      <div className="atlas-footer">
        <span data-testid="source-credit">
          Stations via {CATALOG_CREDITS.map((credit, index) => (
            <span key={credit.href}>
              {index > 0 && ' · '}
              <a href={credit.href} target="_blank" rel="noreferrer noopener">{credit.label}</a>
            </span>
          ))}
          {catalogInfo && (
            <span className="atlas-footer__catalog" data-testid="text-catalog-freshness">
              {catalogInfo.count.toLocaleString('en-US')} channels · crawled {formatCatalogStamp(catalogInfo.generatedAt)}
            </span>
          )}
        </span>
        <span>Listen beyond the static</span>
      </div>

      <FrequencyRuler
        stations={visibleStations}
        selectedStationId={selectedStation?.id ?? null}
        onTune={handleDial}
      />

      {screensaver && (
        <ScreensaverOverlay
          station={selectedStation}
          playback={playback}
          health={selectedStation ? healthById.get(selectedStation.id) ?? 'unknown' : 'unknown'}
          analyser={controller.getAnalyser()}
          onTogglePlayback={togglePlayback}
          onWake={wakeScreensaver}
        />
      )}

      <div
        className={`list-scrim${listOpen ? ' is-open' : ''}`}
        aria-hidden="true"
        onClick={() => setListOpen(false)}
      />

      <aside
        className={`list-drawer${listOpen ? ' is-open' : ''}`}
        ref={listRef}
        aria-label="Station list"
      >
        <div className="list-drawer__head">
          <div className="list-drawer__title">
            <p>{showingShelf ? shelfCopy.kicker : status === 'success' ? listingTitle : placeholderTitle}</p>
            <h2 data-testid="list-drawer-heading">
              {showingShelf
                ? shelfCopy.heading
                : status === 'success'
                  ? `${usableStations.length.toLocaleString('en-US')} station${usableStations.length === 1 ? '' : 's'}`
                  : 'The directory'}
            </h2>
          </div>
          <div className="list-drawer__actions">
            {listReady && (
              <span className="result-count" data-testid="text-result-count">
                {visibleStations.length.toLocaleString('en-US')} {visibleStations.length === 1 ? 'SIGNAL' : 'SIGNALS'}
              </span>
            )}
            {shelf === 'recent' && recentStations.length > 0 && (
              <button
                type="button"
                className="list-drawer__clear"
                onClick={() => resetRecentChannels()}
                data-testid="button-clear-history"
              >
                Clear log
              </button>
            )}
            <button
              type="button"
              className="list-drawer__close"
              onClick={() => setListOpen(false)}
              aria-label="Close station list"
              data-testid="button-close-list"
            >
              <X aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="list-drawer__body">
          <div className="results" data-testid="results-region">
            <p className="sr-only" role="status" data-testid="results-announcement">
              {listReady
                ? `${visibleStations.length.toLocaleString('en-US')} ${visibleStations.length === 1 ? 'station' : 'stations'} shown${submittedQuery ? ` for ${submittedQuery}` : ''}.`
                : status === 'empty'
                  ? `No stations found${submittedQuery ? ` for ${submittedQuery}` : ''}.`
                  : ''}
            </p>

            <div className="shelf-switch" role="group" aria-label="Saved channels">
              <button
                type="button"
                aria-pressed={!showingShelf}
                className={`shelf-switch__option${!showingShelf ? ' is-active' : ''}`}
                onClick={() => handleShelfChange('all')}
                data-testid="button-shelf-all"
              >
                All signals
              </button>
              <button
                type="button"
                aria-pressed={shelf === 'pinned'}
                className={`shelf-switch__option${shelf === 'pinned' ? ' is-active' : ''}`}
                onClick={() => handleShelfChange('pinned')}
                data-testid="button-shelf-pinned"
              >
                Pinned {pinnedStations.length}
              </button>
              <button
                type="button"
                aria-pressed={shelf === 'recent'}
                className={`shelf-switch__option${shelf === 'recent' ? ' is-active' : ''}`}
                onClick={() => handleShelfChange('recent')}
                data-testid="button-shelf-recent"
              >
                Recent {recentStations.length}
              </button>
            </div>

            {listReady && (
              <StationFilters
                options={filterOptions}
                filters={filters}
                sort={sort}
                onFilterChange={handleFilterChange}
                onSortChange={setSort}
                onClear={handleClearFilters}
              />
            )}

            {!showingShelf && status === 'idle' && (
              <div className="state-panel" data-testid="state-search-idle">
                <div className="state-glyph"><Signal aria-hidden="true" /></div>
                <h3>The dial is yours.</h3>
                <p>Enter a station name, country, or genre above — every catalog answers as one dial.</p>
              </div>
            )}
            {!showingShelf && status === 'loading' && (
              <div className="skeleton-list" role="status" aria-label={`Searching stations for ${submittedQuery}`} data-testid="state-search-loading">
                {[0, 1, 2, 3].map((item) => <div className="skeleton-row" key={item}><div className="skeleton-block skeleton-icon" /><div className="skeleton-copy"><div className="skeleton-block skeleton-name" /><div className="skeleton-block skeleton-sub" /></div></div>)}
              </div>
            )}
            {!showingShelf && status === 'empty' && (
              <div className="state-panel" data-testid="state-search-empty">
                <div className="state-glyph"><AudioLines aria-hidden="true" /></div>
                <h3>No signal found there.</h3>
                <p>No stations matched “{submittedQuery}”. Try a different spelling, country, or broader genre.</p>
              </div>
            )}
            {!showingShelf && status === 'error' && (
              <div className="state-panel error" role="alert" data-testid="state-search-error">
                <div className="state-glyph"><Signal aria-hidden="true" /></div>
                <h3>We lost the signal.</h3>
                <p>{errorMessage || 'The station directory is temporarily unavailable. Check the connection and try again.'}</p>
                <button className="retry-button" onClick={retrySearch} data-testid="button-retry-search">Try again</button>
              </div>
            )}
            {shelfEmpty && (
              <div className="state-panel" data-testid="state-shelf-empty">
                <div className="state-glyph">
                  {shelf === 'pinned' ? <Star aria-hidden="true" /> : <History aria-hidden="true" />}
                </div>
                <h3>{shelfCopy.title}</h3>
                <p>{shelfCopy.body}</p>
                <button className="retry-button" onClick={() => setShelf('all')} data-testid="button-shelf-back">
                  Back to the directory
                </button>
              </div>
            )}
            {listReady && !shelfEmpty && visibleStations.length === 0 && (
              <div className="state-panel" data-testid="state-filter-empty">
                <div className="state-glyph"><AudioLines aria-hidden="true" /></div>
                <h3>No signals match those filters.</h3>
                <p>Nothing in {showingShelf ? 'the saved shelf' : submittedQuery === '' ? 'the live directory' : `“${submittedQuery}”`} matches the selected filters. Clear the filters to see all {usableStations.length} result{usableStations.length === 1 ? '' : 's'}.</p>
                <button className="retry-button" onClick={() => setFilters(EMPTY_FILTERS)} data-testid="button-clear-filters">Clear filters</button>
              </div>
            )}
            {listReady && visibleStations.length > 0 && (
              <div className="station-list" data-testid="list-station-results">
                {pageStations.map((station, index) => {
                  const isSelected = selectedStation?.id === station.id;
                  const isPinned = pinnedIds.has(station.id);
                  const stream = station.streams[0];
                  const health = healthById.get(station.id) ?? 'unknown';
                  return (
                    <div
                      key={station.id}
                      className={`station-row${isSelected ? ' is-selected' : ''} health-${health}`}
                    >
                      <button
                        type="button"
                        className="station-row__main"
                        onClick={() => handleSelectStation(station.id, { autoplay: true })}
                        aria-pressed={isSelected}
                        aria-label={`${station.name || 'Untitled station'}, ${stationLocationLabel(station)}`}
                        data-testid={`button-select-station-${station.id}`}
                      >
                        <span className="station-index">{String(index + 1).padStart(2, '0')}</span>
                        <span className="station-info">
                          <span className="station-name-line">
                            <span className={`station-health-dot health-${health}`} aria-hidden="true" />
                            <span className="station-name" data-testid={`text-station-name-${station.id}`}>{station.name || 'Untitled station'}</span>
                          </span>
                          <span className="station-details">
                            <span className="station-country">{stationLocationLabel(station)}</span>
                            <span className="station-meta">
                              {station.genres.slice(0, 3).map((genre) => <span className="genre-tag" key={genre}>{genre}</span>)}
                              {stream?.codec && <span>{stream.codec.toUpperCase()}{stream.bitrate ? ` · ${stream.bitrate} KBPS` : ''}</span>}
                            </span>
                          </span>
                        </span>
                        <span className="station-state" aria-hidden="true">
                          {health === 'offline' ? <WifiOff className="station-offline-icon" /> : <span className="station-arrow">→</span>}
                        </span>
                      </button>
                      <button
                        type="button"
                        className={`station-row__pin${isPinned ? ' is-pinned' : ''}`}
                        aria-pressed={isPinned}
                        aria-label={`${isPinned ? 'Unpin' : 'Pin'} ${station.name || 'Untitled station'}`}
                        title={isPinned ? 'Unpin channel' : 'Pin channel'}
                        onClick={() => handleTogglePin(station)}
                        data-testid={`button-pin-station-${station.id}`}
                      >
                        <Pin aria-hidden="true" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            {listReady && visibleStations.length > pageStations.length && (
              <button
                type="button"
                className="list-more"
                onClick={() => setListLimit((value) => value + DIRECTORY_PAGE_SIZE)}
                data-testid="button-more-stations"
              >
                <span className="list-more__label">
                  Show next {Math.min(DIRECTORY_PAGE_SIZE, visibleStations.length - pageStations.length)} channels
                </span>
                <span className="list-more__remaining">
                  {(visibleStations.length - pageStations.length).toLocaleString('en-US')} still in the directory
                </span>
              </button>
            )}
          </div>
        </div>
      </aside>
    </main>
  );
}

function Router() {
  return (
    // Keep a shared shell outside the boundary so it survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <Router />
    </WouterRouter>
  );
}

export default App;
