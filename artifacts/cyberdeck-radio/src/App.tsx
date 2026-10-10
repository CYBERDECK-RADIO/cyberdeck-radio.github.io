/**
 * CyberDeck Radio shell: search → directory → map/list selection → playback.
 *
 *   query ──▶ radio-browser ──▶ Station[] ──▶ filters ──▶ list + map markers
 *                                                │  select
 *                                                ▼
 *   selectedStation ──▶ AudioController ──▶ PlaybackState ──▶ deck
 *                          ▲  play/pause/stop/volume (user actions)
 *                          └── error ──▶ retry via play again
 *
 * The shell owns selection state; the controller owns playback state. Selecting
 * a station never starts audio — only the explicit play action does.
 */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createAudioController } from '@/audio/audio-controller';
import Deck from '@/components/deck/Deck';
import { ErrorBoundary } from '@/components/error-boundary';
import StationFilters from '@/components/StationFilters';
import StationMap from '@/components/StationMap';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { EMPTY_FILTERS, collectFilterOptions, filterStations, type StationFilters as StationFiltersState } from '@/stations/filter-stations';
import { searchStations } from '@/stations/radio-browser';
import { stationLocationLabel } from '@/stations/station-meta';
import type Station from '@/stations/types';
import { ArrowDownRight, ArrowRight, AudioLines, Radio, Search, Signal, Waves } from 'lucide-react';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

function Home() {
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [stations, setStations] = useState<Station[]>([]);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'empty' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [filters, setFilters] = useState<StationFiltersState>(EMPTY_FILTERS);
  const latestRequest = useRef(0);
  const [controller] = useState(() => createAudioController());
  const playback = useSyncExternalStore(controller.subscribe, controller.getState);
  const [volume, setVolume] = useState(0.8);

  useEffect(() => () => controller.dispose(), [controller]);

  useEffect(() => {
    controller.setVolume(volume);
  }, [controller, volume]);

  useEffect(() => {
    if (!submittedQuery) return;
    const controller = new AbortController();
    const requestId = ++latestRequest.current;
    setStatus('loading');
    setStations([]);
    setSelectedStation(null);
    setFilters(EMPTY_FILTERS);
    setErrorMessage('');
    searchStations({ query: submittedQuery, signal: controller.signal })
      .then((results) => {
        if (controller.signal.aborted || requestId !== latestRequest.current) return;
        setStations(results);
        setStatus(results.length ? 'success' : 'empty');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || requestId !== latestRequest.current) return;
        setErrorMessage(error instanceof Error ? error.message : 'The station directory could not be reached.');
        setStatus('error');
      });
    return () => controller.abort();
  }, [submittedQuery, attempt]);

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

  return (
    <main className="radio-shell" data-testid="page-radio-explorer">
      <div className="radio-wrap">
        <header className="topline">
          <div className="brand-mark" data-testid="brand-cyberdeck-radio">
            <span className="brand-glyph"><Radio aria-hidden="true" /></span>
            <span>CYBERDECK <span style={{ color: '#d5b466' }}>RADIO</span></span>
          </div>
          <div className="top-meta"><span className="live-led" /> GLOBAL FREQUENCY DIRECTORY <span>·</span> 01 / 01</div>
        </header>

        <section className="hero" aria-labelledby="hero-title">
          <div>
            <div className="eyebrow">Shortwave for the curious</div>
            <h1 id="hero-title">Tune into<br /><span>somewhere.</span></h1>
            <p className="hero-copy">A receiver for the wider world. Find a voice, a rhythm, a late-night signal — broadcast from somewhere you have never been.</p>
          </div>
          <div className="dial-module" aria-hidden="true">
            <div className="dial-top"><span>RX · 04</span><span>WORLD BAND</span></div>
            <div className="dial-window"><div className="dial-wave" /><div className="dial-needle" /></div>
            <div className="dial-foot"><span>88.0</span><span>98.5</span><strong>FM / AM</strong><span>108.0</span></div>
          </div>
        </section>

        <section className="search-panel" aria-label="Station search">
          <form onSubmit={handleSearch} data-testid="form-station-search">
            <div className="search-label"><span>01 — Scan the dial</span><span>SEARCH STATIONS WORLDWIDE</span></div>
            <div className="search-row">
              <label className="search-box">
                <Search aria-hidden="true" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Station name, country, or genre"
                  aria-label="Search radio stations"
                  data-testid="input-station-search"
                />
              </label>
              <button type="submit" className="search-button" disabled={!query.trim() || status === 'loading'} data-testid="button-search-stations">
                {status === 'loading' ? <Waves aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
                <span>{status === 'loading' ? 'Scanning' : 'Search'}</span>
              </button>
            </div>
            <div className="search-hint"><span>Search by <strong>station name</strong>, <strong>country</strong> or <strong>genre</strong></span><span>OPEN SIGNAL · NO ACCOUNT NEEDED</span></div>
          </form>
        </section>

        <div className="map-panel">
          <StationMap
            stations={visibleStations}
            selectedStationId={selectedStation?.id ?? null}
            onSelectStation={handleSelectStation}
          />
        </div>

        <section className="workspace" aria-label="Station directory">
          <div className="results-column">
            <div className="results-head">
              <div>
                <div className="section-kicker">03 — The directory</div>
                <h2>{status === 'success' ? `Signals for “${submittedQuery}”` : 'Find your frequency'}</h2>
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
                <h3>The dial is yours.</h3>
                <p>Enter a station name, country, or genre above to find the real broadcasts reaching out from there.</p>
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
                <p>Nothing in “{submittedQuery}” matches the selected country and genre. Clear the filters to see all {stations.length} results.</p>
                <button className="retry-button" onClick={() => setFilters(EMPTY_FILTERS)} data-testid="button-clear-filters">Clear filters</button>
              </div>
            )}
            {status === 'success' && visibleStations.length > 0 && (
              <div className="station-list" role="list" data-testid="list-station-results">
                {visibleStations.map((station, index) => {
                  const isSelected = selectedStation?.id === station.id;
                  const stream = station.streams[0];
                  return (
                    <button
                      key={station.id}
                      className={`station-row${isSelected ? ' is-selected' : ''}`}
                      onClick={() => handleSelectStation(station.id)}
                      aria-pressed={isSelected}
                      data-testid={`button-select-station-${station.id}`}
                    >
                      <span className="station-index">{String(index + 1).padStart(2, '0')}</span>
                      <span className="station-info">
                        <span className="station-name-line"><span className="station-name" data-testid={`text-station-name-${station.id}`}>{station.name || 'Untitled station'}</span></span>
                        <span className="station-country">{stationLocationLabel(station)}</span>
                        <span className="station-meta">
                          {station.genres.slice(0, 3).map((genre) => <span className="genre-tag" key={genre}>{genre}</span>)}
                          {stream?.codec && <span>{stream.codec.toUpperCase()}{stream.bitrate ? ` · ${stream.bitrate} KBPS` : ''}</span>}
                        </span>
                      </span>
                      <ArrowDownRight className="station-arrow" aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <aside className="side-column" aria-label="Tuned station">
            <div className="side-card">
              <div className="side-heading"><span>04 — Current tuning</span><span className={`selected-state${selectedStation ? ' active' : ''}`} data-testid="status-station-selection">{selectedStation ? 'LOCKED' : 'STANDBY'}</span></div>
              <Deck
                station={selectedStation}
                playback={playback}
                volume={volume}
                onTogglePlayback={togglePlayback}
                onStop={() => controller.stop()}
                onVolumeChange={setVolume}
              />
            </div>
            <div className="side-card">
              <div className="side-heading"><span>Signal notes</span><span>RX / 01</span></div>
              <p className="side-note"><strong>One world, many voices.</strong> Search taps into a live directory of independent radio stations. Each listing carries its own stream details and point of origin.</p>
            </div>
          </aside>
        </section>

        <footer className="footer-line">
          <span>CYBERDECK RADIO · FIELD RECEIVER 001</span>
          <span>STATIONS VIA <a href="https://www.radio-browser.info/" target="_blank" rel="noreferrer noopener">RADIO-BROWSER.INFO</a></span>
          <span>LISTEN BEYOND THE STATIC</span>
        </footer>
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
