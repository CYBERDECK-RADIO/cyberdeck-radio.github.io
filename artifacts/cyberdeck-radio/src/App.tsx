/**
 * CyberDeck Radio — World Broadcast Atlas shell.
 *
 *   layout: full-bleed MapLibre world (hero) + glass overlay rails
 *     topbar:  wordmark · live status · skin switch
 *     search:  centered "scan the dial" command bar
 *     left rail:  directory (filters + scrollable results over the map)
 *     right rail: the deck (current tuning + transport)
 *     the center of the map is deliberately left open so signals breathe.
 *
 *   query ──▶ radio-browser ──▶ Station[] ──▶ filters ──▶ list + pulse map
 *                                                │  select
 *                                                ▼
 *   selectedStation ──▶ AudioController ──▶ PlaybackState ──▶ deck
 *                          ▲  play/pause/stop/volume (user actions)
 *                          └── error ──▶ retry via play again
 *
 *   selectedStation + PlaybackState ──▶ Media Session (lock screen / keys)
 *   volume + visualizer style ──▶ localStorage (lightweight preferences)
 *
 * The shell owns selection state; the controller owns playback state. Selecting
 * a station never starts audio — only the explicit play action does.
 */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createAudioController } from '@/audio/audio-controller';
import { createMetadata, getMediaSession, syncMediaSession } from '@/audio/media-session';
import Deck from '@/components/deck/Deck';
import { ErrorBoundary } from '@/components/error-boundary';
import SkinToggle from '@/components/SkinToggle';
import StationFilters from '@/components/StationFilters';
import StationMap from '@/components/StationMap';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { usePreferences } from '@/preferences/use-preferences';
import { EMPTY_FILTERS, collectFilterOptions, filterStations, type StationFilters as StationFiltersState } from '@/stations/filter-stations';
import { listStationSources, STATION_SOURCES, type StationSourceId } from '@/stations/sources';
import { registerStations } from '@/stations/stream-health';
import { useStationHealth } from '@/stations/use-station-health';
import { stationLocationLabel } from '@/stations/station-meta';
import { useSkin } from '@/skin/use-skin';
import type Station from '@/stations/types';
import { ArrowDownRight, ArrowRight, AudioLines, Radio, Search, Signal, Waves, WifiOff } from 'lucide-react';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

function Home() {
  const { skin, setSkin } = useSkin();
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [stations, setStations] = useState<Station[]>([]);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'empty' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [filters, setFilters] = useState<StationFiltersState>(EMPTY_FILTERS);
  const [sourceId, setSourceId] = useState<StationSourceId>('airwaves');
  const latestRequest = useRef(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [controller] = useState(() => createAudioController());
  const playback = useSyncExternalStore(controller.subscribe, controller.getState);
  const { volume, setVolume, visualizerStyle, cycleVisualizerStyle } = usePreferences();
  const healthById = useStationHealth();

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

  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++latestRequest.current;
    setStatus(submittedQuery ? 'loading' : 'idle');
    if (!submittedQuery) {
      setStations([]);
      setSelectedStation(null);
      setFilters(EMPTY_FILTERS);
      setErrorMessage('');
    }
    STATION_SOURCES[sourceId]
      .getStations({ query: submittedQuery, signal: controller.signal })
      .then((results) => {
        if (controller.signal.aborted || requestId !== latestRequest.current) return;
        setStations(results);
        setStatus(results.length ? 'success' : 'empty');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || requestId !== latestRequest.current) return;
        if (submittedQuery) {
          setErrorMessage(error instanceof Error ? error.message : 'The station directory could not be reached.');
          setStatus('error');
        }
        // A cold catalog load failing silently keeps the idle search bar usable.
      });
    return () => controller.abort();
  }, [sourceId, submittedQuery, attempt]);

  useEffect(() => {
    registerStations(stations);
  }, [stations]);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanQuery = query.trim();
    if (!cleanQuery) return;
    if (cleanQuery === submittedQuery) setAttempt((value) => value + 1);
    else setSubmittedQuery(cleanQuery);
  }

  function retrySearch() {
    setAttempt((value) => value + 1);
  }

  function focusSearch() {
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  }

  function handleSelectStation(stationId: string) {
    const station = stations.find((item) => item.id === stationId);
    if (station) setSelectedStation(station);
  }

  const filterOptions = useMemo(() => collectFilterOptions(stations), [stations]);
  const visibleStations = useMemo(() => filterStations(stations, filters), [stations, filters]);

  const isTuning = playback.status === 'playing' || playback.status === 'loading';

  function togglePlayback() {
    if (!selectedStation) return;
    if (isTuning) controller.pause();
    else void controller.play(selectedStation);
  }

  const statusLabel =
    status === 'loading'
      ? 'SCANNING'
      : status === 'error'
        ? 'OFFLINE'
        : status === 'empty'
          ? 'NO SIGNAL'
          : status === 'success'
            ? `${visibleStations.length} LIVE`
            : 'STANDBY';

  const source = STATION_SOURCES[sourceId];
  const listingTitle = submittedQuery === '' ? source.browseTitle : `Signals for “${submittedQuery}”`;
  const placeholderTitle = source.placeholderTitle;

  return (
    <main className="atlas" data-testid="page-radio-explorer">
      <div className="atlas__map">
        <StationMap
          variant="atlas"
          stations={visibleStations}
          selectedStationId={selectedStation?.id ?? null}
          healthById={healthById}
          onSelectStation={handleSelectStation}
          onRequestSearch={focusSearch}
        />
      </div>
      <div className="atlas__scrim" aria-hidden="true" />

      <div className="atlas__overlay">
        <header className="atlas__topbar">
          <div className="brand-mark" data-testid="brand-cyberdeck-radio">
            <span className="brand-glyph"><Radio aria-hidden="true" /></span>
            <span className="brand-word">CYBERDECK <span className="brand-accent">RADIO</span></span>
          </div>
          <div className="atlas__topbar-right">
            <div className="top-meta"><span className="live-led" /> WORLD BROADCAST ATLAS <span>·</span> {statusLabel}</div>
            <SkinToggle skin={skin} onChange={setSkin} />
          </div>
        </header>

        <section className="search-panel atlas__search" aria-label="Station search">
          <form onSubmit={handleSearch} data-testid="form-station-search">
            <div className="search-label">
              <span>01 — Scan the dial</span>
              <span className="source-switch" role="tablist" aria-label="Channel source">
                {listStationSources().map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={sourceId === item.id}
                    className={`source-switch__option${sourceId === item.id ? ' is-active' : ''}`}
                    onClick={() => {
                      setFilters(EMPTY_FILTERS);
                      setSourceId(item.id);
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </span>
            </div>
            <div className="search-row">
              <label className="search-box">
                <Search aria-hidden="true" />
                <input
                  type="search"
                  ref={searchInputRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={source.placeholder}
                  aria-label="Search radio stations"
                  data-testid="input-station-search"
                />
              </label>
              <button
                type="submit"
                className={`search-button${status === 'loading' ? ' is-loading' : ''}`}
                disabled={!query.trim() || status === 'loading'}
                data-testid="button-search-stations"
              >
                {status === 'loading' ? <Waves aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
                <span>{status === 'loading' ? 'Scanning' : 'Search'}</span>
              </button>
            </div>
            <div className="search-hint"><span>{source.hint}</span><span>{source.meta}</span></div>
          </form>
        </section>

        <div className="atlas__rail atlas__rail--left">
          <div className="results-column atlas-panel" data-testid="results-region">
            <div className="atlas-panel__grip" aria-hidden="true" />
            <div className="results-head">
              <div>
                <div className="section-kicker">02 — The directory</div>
                <h2>{status === 'success' ? listingTitle : placeholderTitle}</h2>
              </div>
              {status === 'success' && <span className="result-count" data-testid="text-result-count">{visibleStations.length} {visibleStations.length === 1 ? 'SIGNAL' : 'SIGNALS'}</span>}
            </div>
            {status === 'success' && (
              <StationFilters
                countries={filterOptions.countries}
                genres={filterOptions.genres}
                country={filters.country}
                genre={filters.genre}
                onCountryChange={(value) => setFilters((current) => ({ ...current, country: value }))}
                onGenreChange={(value) => setFilters((current) => ({ ...current, genre: value }))}
                onClear={() => setFilters(EMPTY_FILTERS)}
              />
            )}
            {status === 'idle' && (
              <div className="state-panel" data-testid="state-search-idle">
                <div className="state-glyph"><Signal aria-hidden="true" /></div>
                <h3>{source.idleTitle}</h3>
                <p>{source.idleBody}</p>
              </div>
            )}
            {status === 'loading' && (
              <div className="skeleton-list" role="status" aria-label={`Searching stations for ${submittedQuery}`} data-testid="state-search-loading">
                {[0, 1, 2, 3].map((item) => <div className="skeleton-row" key={item}><div className="skeleton-block skeleton-icon" /><div className="skeleton-copy"><div className="skeleton-block skeleton-name" /><div className="skeleton-block skeleton-sub" /></div></div>)}
              </div>
            )}
            {status === 'empty' && (
              <div className="state-panel" data-testid="state-search-empty">
                <div className="state-glyph"><AudioLines aria-hidden="true" /></div>
                <h3>No signal found there.</h3>
                <p>No stations matched “{submittedQuery}”. Try a different spelling, country, or broader genre.</p>
              </div>
            )}
            {status === 'error' && (
              <div className="state-panel error" role="alert" data-testid="state-search-error">
                <div className="state-glyph"><Signal aria-hidden="true" /></div>
                <h3>We lost the signal.</h3>
                <p>{errorMessage || 'The station directory is temporarily unavailable. Check the connection and try again.'}</p>
                <button className="retry-button" onClick={retrySearch} data-testid="button-retry-search">Try again</button>
              </div>
            )}
            {status === 'success' && visibleStations.length === 0 && (
              <div className="state-panel" data-testid="state-filter-empty">
                <div className="state-glyph"><AudioLines aria-hidden="true" /></div>
                <h3>No signals match those filters.</h3>
                <p>Nothing in {submittedQuery === '' ? 'the live directory' : `“${submittedQuery}”`} matches the selected filters. Clear the filters to see all {stations.length} results.</p>
                <button className="retry-button" onClick={() => setFilters(EMPTY_FILTERS)} data-testid="button-clear-filters">Clear filters</button>
              </div>
            )}
            {status === 'success' && visibleStations.length > 0 && (
              <div className="station-list" role="list" data-testid="list-station-results">
                {visibleStations.map((station, index) => {
                  const isSelected = selectedStation?.id === station.id;
                  const stream = station.streams[0];
                  const health = healthById.get(station.id) ?? 'unknown';
                  return (
                    <button
                      key={station.id}
                      className={`station-row${isSelected ? ' is-selected' : ''} health-${health}`}
                      onClick={() => handleSelectStation(station.id)}
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
                        {health === 'offline' ? <WifiOff className="station-offline-icon" /> : <ArrowDownRight className="station-arrow" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <aside className="atlas__rail atlas__rail--right" aria-label="Tuned station">
          <div className="side-card atlas-panel">
            <div className="side-heading"><span>03 — Current tuning</span><span className={`selected-state${selectedStation ? ' active' : ''}`} data-testid="status-station-selection">{selectedStation ? 'LOCKED' : 'STANDBY'}</span></div>
            <Deck
              station={selectedStation}
              playback={playback}
              volume={volume}
              health={selectedStation ? healthById.get(selectedStation.id) ?? 'unknown' : 'unknown'}
              onTogglePlayback={togglePlayback}
              onStop={() => controller.stop()}
              onVolumeChange={setVolume}
              visualizerStyle={visualizerStyle}
              onCycleVisualizerStyle={cycleVisualizerStyle}
            />
          </div>
        </aside>
      </div>
    </main>
  );
}

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
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
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
