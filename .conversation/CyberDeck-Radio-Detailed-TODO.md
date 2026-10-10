# CyberDeck Radio — Detailed Engineering TODO

**Purpose:** Turn the PRD and implementation plan into an executable backlog. The MVP is a static web app for discovering stations, playing HTTPS streams, and presenting the selected station in a retro-inspired deck.

**Working rules:** Keep the MVP small (KISS); ship end-to-end vertical slices; write a failing test before implementation where practical (TDD); give parallel contributors isolated modules with explicit contracts; keep each module's public surface small and hide its implementation complexity (deep modules).

## 0. Delivery rules and boundaries

- [ ] Treat the MVP as complete only when a listener can search, select, play, switch stations, and recover from a playback failure on the deployed static site.
- [ ] Keep the runtime static: no app server, user account, database, proxy, or required secret.
- [ ] Use one real station source for MVP: Radio Browser, subject to Phase 1 validation.
- [ ] Use HTTPS stream URLs only from an HTTPS app; never silently downgrade or proxy a stream.
- [ ] Keep stream playback working when CORS prevents Web Audio analysis; simulated visualization is an acceptable fallback.
- [ ] Defer AI, speech DJ, Winamp `.wsz`, full JetAudio skins, globe mode, stream crawler, relay, and PWA until the MVP is validated.
- [ ] Keep one issue/task to one reviewable outcome; do not bundle unrelated features into a “phase” ticket.
- [ ] Every implementation task includes an automated test or a stated reason a manual browser check is the only meaningful verification.
- [ ] No contributor changes a shared interface without proposing the change to the integrator first.

## 1. Module contracts — agree before fan-out

These are intentionally narrow internal seams, not a general plugin framework.

```ts
export type Station = {
  id: string;
  name: string;
  countryCode?: string;
  country?: string;
  genres: string[];
  coordinates?: [longitude: number, latitude: number];
  streams: Array<{ url: string; codec?: string; bitrate?: number }>;
  homepage?: string;
};

export interface StationProvider {
  search(input: {
    query?: string;
    countryCode?: string;
    genre?: string;
    signal?: AbortSignal;
  }): Promise<Station[]>;
}

export type PlaybackState =
  | { status: 'idle' }
  | { status: 'loading'; station: Station; streamIndex: number }
  | { status: 'playing'; station: Station; streamIndex: number }
  | { status: 'paused'; station: Station; streamIndex: number }
  | { status: 'error'; station: Station; message: string };

export interface AudioController {
  getState(): PlaybackState;
  subscribe(listener: (state: PlaybackState) => void): () => void;
  play(station: Station): Promise<void>;
  pause(): void;
  stop(): void;
  setVolume(value: number): void;
  dispose(): void;
}
```

- [ ] Agree the station field names and coordinate order (`longitude, latitude`) before parallel implementation.
- [ ] Agree that `StationProvider.search` returns normalized app-owned data and throws/rejects on provider failure; empty array means a successful search with no results.
- [ ] Agree playback emits explicit loading/playing/paused/error states and attempts at most one subsequent valid stream after a failure.
- [ ] Map module accepts stations and a selected station ID, then reports selection through one callback; it does not fetch data or control audio.
- [ ] Deck receives selected station and playback state; it does not own playback or query the provider.
- [ ] Visualizer reports its mode (`analyser` or `simulated`); it must never be a prerequisite for audible playback.
- [ ] Freeze these contracts for the first implementation wave. Changes go through one short integration decision, then all contributors update together.

## 2. Phase 0 — Parallel feasibility spikes (time-boxed)

Run these as independent, read-only or throwaway spikes. Each owner returns a short evidence note, exact URLs tested, browser/environment, and recommendation. Do not build production features in this phase.

### Spike A — Radio Browser feasibility

- [ ] Inspect the current API endpoints and sample station response fields.
- [ ] From a browser context, test a bounded search request and verify CORS, response time, and failure behavior.
- [ ] Confirm whether country/genre filters can be queried efficiently or must be filtered client-side.
- [ ] Document rate-limit guidance and any user-agent/header requirements.
- [ ] Recommend runtime API vs generated static snapshot; do not implement both.
- [ ] Exit: one query works from the intended deployment origin or the static-snapshot fallback is selected.

### Spike B — Map and tile source

- [ ] Verify MapLibre can render the proposed map style without a paid token or private credential.
- [ ] Confirm public tile terms, attribution, expected request limits, and production suitability.
- [ ] Render a minimal map and a marker at a known coordinate.
- [ ] Verify the base map remains usable at mobile width and keyboard/assistive alternatives are planned.
- [ ] Recommend a supported initial projection; use standard 2D for MVP.
- [ ] Exit: a named style/source is selected with terms and attribution understood.

### Spike C — Real stream playback matrix

- [ ] Select 5–10 representative HTTPS streams from different countries/codecs; do not assume directory metadata guarantees reachability.
- [ ] Test direct `<audio>` playback in desktop Chrome, Firefox, Safari, and at least one mobile browser/device where available.
- [ ] Test at least one known failure and one station with a backup URL.
- [ ] Test whether Web Audio analysis works for a sample and record what happens when CORS blocks it.
- [ ] Record HLS presence, but do not add HLS support to MVP solely because it exists in the directory.
- [ ] Exit: playback constraints, fallback behavior, and a minimum manual-test set are written down.

### Spike D — Product/launch assumptions (integrator)

- [ ] Pick audience for first release: personal/demo vs public open-source service.
- [ ] Set a simple visual target: custom JetAudio-inspired controls, not a Winamp emulator.
- [ ] Decide runtime query vs static snapshot based on Spike A.
- [ ] Confirm that public launch does not require telemetry; default to no analytics unless there is a clear need and privacy decision.
- [ ] Record decisions in `docs/decisions.md`; unresolved decisions must not be disguised as implementation tasks.

### Phase 0 integration gate

- [ ] Review spike notes together; settle only decisions that change architecture.
- [ ] If no viable browser-only provider/map/stream combination is found, stop and revise scope before feature implementation.
- [ ] Create a small vertical-slice branch/build plan from the decisions; avoid speculative infrastructure.

## 3. Delegation plan — fan out safely

Fan-out starts only after the contracts in Section 1 are agreed and the base project runs. One integrator owns shared contracts, dependency/version changes, cross-module integration, release decisions, and final acceptance.

### Delegate 1 — Station data module

**Owns:** `src/stations/**`, `src/stations/__tests__/**`  
**Does not own:** shared `Station` type, app shell, map, player, global styles, deployment files.

- [ ] Write normalization tests for valid, partial, malformed, and empty provider records.
- [ ] Implement one `RadioBrowserStationProvider` behind the `StationProvider` interface.
- [ ] Map source coordinates into `[longitude, latitude]`; omit invalid or absent coordinates.
- [ ] Normalize missing genres to `[]`; preserve valid metadata without leaking raw provider objects to UI.
- [ ] Add bounded request timeout and abort handling for stale searches.
- [ ] Distinguish successful empty results from network/API failure.
- [ ] Filter invalid stream URLs from playable candidates; do not claim a stream is live based on directory metadata.
- [ ] Add tests for query/country/genre mapping and provider error propagation.
- [ ] Deliver module, tests, and a brief usage example; no UI changes.

### Delegate 2 — Audio playback module

**Owns:** `src/audio/**`, `src/audio/__tests__/**`  
**Does not own:** shared station type, deck visuals, provider API, app shell, map.

- [ ] Write state-transition tests first using a fake media element or injected media adapter.
- [ ] Implement one controller around one HTML audio element; expose only the `AudioController` contract.
- [ ] Sort/filter stream candidates so only HTTPS URLs are attempted on an HTTPS page.
- [ ] Attempt candidates sequentially and bound fallback to one pass; do not create infinite retries.
- [ ] Emit loading, playing, paused, idle, and actionable error states.
- [ ] Implement stop, pause, volume clamping, station switching, and listener cleanup.
- [ ] Handle browser `play()` rejection/autoplay policy without claiming playback started.
- [ ] Ensure switching stations detaches prior listeners and stops old playback.
- [ ] Deliver module, deterministic unit tests, and documented event/state behavior; no React component changes.

### Delegate 3 — Map module

**Owns:** `src/map/**`, `src/map/__tests__/**`  
**Does not own:** provider fetching, station contract, playback, page layout, global CSS tokens.

- [ ] Write tests for marker generation from valid coordinates and omission of invalid/missing coordinates.
- [ ] Implement a `MapView` that takes stations, selected ID, and `onSelect(id)`.
- [ ] Keep MapLibre initialization/disposal, marker updates, and map-library events inside the module.
- [ ] Selecting a marker invokes the callback; it must not alter player state directly.
- [ ] Support an empty station set and loading/error presentation through a small status prop or caller-owned wrapper.
- [ ] Provide a non-map list path for users who cannot use the map; do not make map interaction the only way to select stations.
- [ ] Include required attribution and avoid hard-coded secret keys.
- [ ] Deliver the component, isolated tests for mapping logic, and one manual browser check; no provider or shell edits.

### Delegate 4 — Visual system and deck component

**Owns:** `src/components/deck/**`, `src/styles/theme.css`  
**Does not own:** audio engine, provider, map, app-level selection state, deployment.

- [ ] Write component tests for idle/loading/playing/paused/error display states.
- [ ] Build a compact JetAudio-inspired deck with station display and control affordances.
- [ ] Treat controls as callbacks supplied by the app; do not construct an audio element in the deck.
- [ ] Add a visualizer that can render simulated mode without Web Audio access; do not mislabel it as measured audio.
- [ ] Honor reduced-motion preferences and provide readable labels/focus states.
- [ ] Keep the first version CSS/SVG/canvas only; no skin parser or large asset dependency.
- [ ] Deliver component API, screenshots or a manual visual check, and tests; no global app layout edits.

### Integrator-owned work

- [ ] Create the project shell, dependency manifest, scripts, CI, global station types, and routing/base path.
- [ ] Keep shared contracts in a small stable module, e.g. `src/domain/station.ts`.
- [ ] Wire modules into the app and own cross-module integration tests.
- [ ] Resolve conflicts and review changes at the public module boundary; do not duplicate a delegate's implementation.
- [ ] Re-run whole-app tests after each merge; merge one module at a time.

### Fan-out rules

- [ ] Maximum four implementation workstreams in parallel, and only when their owned paths do not overlap.
- [ ] Each delegate gets one outcome, contract, allowed file paths, prohibited scope, required tests, and a deliverable checklist.
- [ ] Start integration at the boundary as soon as each module returns; do not wait for every visual detail to be polished.
- [ ] If tasks share an unstable interface, sequence them instead of parallelizing.
- [ ] Do not delegate “build the whole app”; split by deep module and vertical outcome, not by arbitrary file count.
- [ ] Reserve integration and browser acceptance for the integrator; independent green unit tests do not prove the product works end-to-end.

## 4. Project foundation — one small setup task

- [ ] Create Vite + React + TypeScript static app using the repo's existing conventions where applicable.
- [ ] Add only essential scripts: `dev`, `build`, `preview`, `test`, `lint` (and type-check if separate).
- [ ] Add the smallest test setup suitable for pure modules and React components; do not add a full end-to-end framework until a deploy smoke test needs it.
- [ ] Configure a production base path that can build for a GitHub Pages repository subpath.
- [ ] Add a minimal CI workflow that installs reproducibly, runs tests/lint/typecheck, and builds.
- [ ] Add a static shell with header, search region, results region, map placeholder, and persistent deck region.
- [ ] Make the shell responsive and keyboard navigable before adding visual polish.
- [ ] Add a fixture station and fixture provider for deterministic development/tests; keep fixture mode out of production behavior unless explicitly selected.
- [ ] Confirm clean checkout → install → test → build works.
- [ ] Do not add a backend, database, auth, global state framework, generic event bus, or analytics package.

## 5. Vertical slices — build the product in user-visible increments

Each slice should merge as a usable increment with tests; the next slice builds on the working one. Prefer a thin path through provider → state → UI over completing all backend modules, then all UI modules separately.

### Slice 1 — Search and select a station (list-first)

**User outcome:** A listener searches and can select a station from real results.

- [ ] Add a failing provider-adapter test for a representative Radio Browser response.
- [ ] Implement normalization and provider search using the chosen Phase 0 strategy.
- [ ] Add a failing UI test: submit query → loading → results; empty and provider-error states are distinct.
- [ ] Implement query input with submit/debounce behavior chosen to avoid excessive provider requests.
- [ ] Implement result rows showing name, country, and available genre/bitrate metadata.
- [ ] Add country/genre filtering only after provider behavior is known; test absent metadata and clear-filter behavior.
- [ ] Keep selected station ID in one app-level state owner.
- [ ] Add list selection with a visible selected state and keyboard support.
- [ ] Add retry on provider failure; do not auto-loop requests.
- [ ] Verify end-to-end with deterministic provider fixture and one real provider browser check.

**Done when:** Search, no-results, provider-error, retry, and station selection states are tested and understandable.

### Slice 2 — Play, switch, and recover

**User outcome:** The selected station can be heard and playback failure is recoverable.

- [ ] Write controller tests for play success, pause/resume, stop, volume, failed primary, successful backup, all candidates failed, and station switching.
- [ ] Implement HTTPS candidate filtering and bounded sequential fallback.
- [ ] Wire selected station to the controller; keep one audio element/controller instance.
- [ ] Add visible play/pause/stop/volume controls and disabled/loading/error states.
- [ ] Add a station metadata display in the deck; reflect the controller state rather than guessing from button clicks.
- [ ] Handle autoplay denial with an explicit user action to retry.
- [ ] Verify a playable real station, one known broken URL, and one station with a backup URL manually.
- [ ] Confirm there is no insecure request from the HTTPS app and no infinite retries.

**Done when:** A user can start audio after a deliberate click, switch stations, and understand/fix a failure without reloading.

### Slice 3 — Add the synchronized map

**User outcome:** Map and list are two ways to discover/select the same station set.

- [ ] Unit-test coordinate validation and marker input conversion before integrating MapLibre.
- [ ] Render the selected map source and attribution.
- [ ] Render markers only for stations with valid coordinates.
- [ ] Add marker → selected-station callback; test that it updates list/deck selection.
- [ ] Add list → map selected marker/focus update.
- [ ] Avoid refetching or duplicating station state inside the map module.
- [ ] Add empty/no-coordinate handling and preserve list usability if the map fails to load.
- [ ] Check map sizing after responsive layout changes and clean up the map instance on unmount.
- [ ] Verify tile terms, attribution, no leaked credentials, and production URL behavior.

**Done when:** One selected station stays synchronized across list, map marker, and player, and map failure never blocks list-based listening.

### Slice 4 — Finish the retro deck without coupling it to audio internals

**User outcome:** The app feels like CyberDeck and playback states remain accurate.

- [ ] Write component tests for each playback state before adding visual treatments.
- [ ] Add CRT/phosphor/rack theme tokens and a compact VFD-style display.
- [ ] Add decorative cassette/reel motion only when reduced motion is not requested.
- [ ] Add clear button labels, focus indicators, sufficient contrast, and responsive controls.
- [ ] Implement visualizer interface with `simulated` default; show `analyser` mode only when actually connected and working.
- [ ] Test CORS-blocked Web Audio path: direct audio must continue; simulated mode must be selected.
- [ ] Keep equalizer out unless a tested Web Audio path and explicit product acceptance are available.
- [ ] Verify deck works at narrow phone and desktop sizes.

**Done when:** Visual state matches real controller state; visuals do not control or interrupt audio.

### Slice 5 — Static deploy and launch hardening

**User outcome:** A clean public URL loads correctly and the core path works on supported devices.

- [ ] Add a production build check to CI.
- [ ] Serve the production build locally and check nested/static asset paths.
- [ ] Deploy to a test GitHub Pages repository path and run a smoke checklist against that URL.
- [ ] Check browser console/network for failed assets, HTTP audio, missing tile resources, or exposed credentials.
- [ ] Test current desktop Chrome, Firefox, Safari, and one mobile device/browser where available.
- [ ] Test keyboard-only search → select → play controls; check focus visibility and screen-reader labels.
- [ ] Test reduced-motion preference and map-unavailable behavior.
- [ ] Add source attribution, known limitations, and troubleshooting for blocked/geo-restricted streams.
- [ ] Confirm no telemetry, PWA, or offline-stream claims were added without separate decisions.
- [ ] Publish only after the acceptance checklist below passes.

**Done when:** Production build is reproducible; repository-subpath deploy works; all key limitations are explicit.

## 6. TDD checklist by module

### Station provider tests

- [ ] Normalizes a complete record.
- [ ] Handles missing optional fields without crashing.
- [ ] Rejects malformed IDs/names and invalid coordinates safely.
- [ ] Produces `genres: []` when genre data is missing.
- [ ] Treats empty successful response as `[]`.
- [ ] Surfaces timeout/network/API failure distinctly from empty results.
- [ ] Aborted/stale requests do not overwrite newer query results.
- [ ] Filters/requests only what is supported by the selected API behavior.

### Playback tests

- [ ] HTTPS candidate is attempted; HTTP candidate is never attempted on HTTPS page.
- [ ] Loading state appears before playback resolves.
- [ ] Playing state only appears after media confirms play; rejected autoplay becomes a recoverable error.
- [ ] Pause/resume/stop and volume boundaries behave correctly.
- [ ] Failed primary advances once to an available backup.
- [ ] All failures produce one stable error state with no timer/retry loop.
- [ ] Switching stations cancels old listeners and prevents stale events changing the new state.
- [ ] `dispose()` releases listeners/media resources.

### UI/integration tests

- [ ] Query loading, results, empty, error, and retry states render.
- [ ] Country/genre filters can be applied and cleared.
- [ ] Selecting result updates selected ID and deck.
- [ ] Marker callback updates the same selected ID.
- [ ] Map load failure still leaves the result list and player usable.
- [ ] Deck controls call controller actions and display controller state.
- [ ] Simulated visualizer is identified as simulated.
- [ ] Core keyboard path and reduced-motion behavior are covered or listed as manual checks.

### Manual tests that automation cannot replace

- [ ] Actual audio from representative public station endpoints on browser/device matrix.
- [ ] CORS/Web Audio behavior for a known allowed and a known blocked stream.
- [ ] Map tile attribution/terms and real production path.
- [ ] Mobile autoplay interaction and Media Session behavior if included.

## 7. KISS guardrails

- [ ] One provider, one map, one audio element, one selected-station state owner.
- [ ] Use plain React state/context only if prop flow makes it genuinely simpler; do not preemptively add Redux/Zustand or an event bus.
- [ ] No generic plugin architecture for one station source or one visualizer.
- [ ] No station health-score schema until an actual scheduled probe exists.
- [ ] No attempt to solve CORS with a public proxy or to bypass geo-restrictions.
- [ ] No model download, skin marketplace, user accounts, or personal library in MVP.
- [ ] Prefer an honest fallback over a brittle compatibility layer.
- [ ] Remove abstractions that do not hide meaningful complexity or support a demonstrated second use case.

## 8. Deep-module review checklist

Use these checks when reviewing module boundaries; the goal is a small interface hiding a lot of detail, not many tiny wrappers.

- [ ] Does the caller express intent in a few calls (e.g. `provider.search`, `controller.play`) without knowing browser/API mechanics?
- [ ] Is provider-specific JSON confined to the station adapter?
- [ ] Are MediaElement events, stream fallback, autoplay errors, and cleanup confined to the audio controller?
- [ ] Are MapLibre lifecycle and marker bookkeeping confined to the map module?
- [ ] Does the deck depend on playback state and callbacks rather than audio implementation details?
- [ ] Can each module be tested without booting the whole app?
- [ ] Are duplicate concepts/state representations eliminated?
- [ ] Is the interface smaller than the complexity hidden behind it? If not, simplify or combine modules.

## 9. Integration and delegation operating checklist

For every delegated ticket, include:

- [ ] **Outcome:** one user-visible or module-level result.
- [ ] **Contract:** input/output and state/error semantics.
- [ ] **Ownership:** exact paths the delegate may change.
- [ ] **Non-goals:** explicit nearby work they must not start.
- [ ] **Tests:** tests to add and command to run.
- [ ] **Done evidence:** changed files, test output, manual notes if needed.

For each return:

- [ ] Read the implementation and tests; do not merge on “done” alone.
- [ ] Run module tests and then integration tests locally/CI.
- [ ] Check the public boundary for leaked provider/map/audio implementation details.
- [ ] Merge one module at a time; fix contract mismatches immediately.
- [ ] Add one end-to-end check across the real seams before starting another fan-out wave.

## 10. MVP acceptance and launch checklist

- [ ] Search by station name returns results or a clear no-results state.
- [ ] Provider failure is distinguishable from no results and retry is available.
- [ ] Country/genre filters work with missing metadata and can be cleared.
- [ ] List and map selection remain synchronized.
- [ ] Play, pause, stop, volume, station switching, and error recovery work.
- [ ] No HTTP stream is attempted from HTTPS.
- [ ] Backup is attempted at most once per candidate set; no infinite retry loop.
- [ ] If Web Audio fails/CORS is blocked, audible direct playback still works.
- [ ] Simulated visualization is not represented as real audio analysis.
- [ ] Responsive layout, keyboard operation, focus, contrast, and reduced motion are checked.
- [ ] Production build and GitHub Pages subpath smoke test pass.
- [ ] Data/map attribution and public station limitations are documented.
- [ ] No browser-bundled secret, required backend, or unapproved telemetry is present.

## 11. Explicitly deferred backlog (do not pull into MVP)

- [ ] HLS via lazy-loaded HLS library — revisit after collecting actual station-format needs.
- [ ] Media Session lock-screen controls — add after mobile playback testing identifies value and browser support is checked.
- [ ] 10-band EQ/analyser — add only with reliable cross-origin handling and explicit fallback.
- [ ] Day/night styling or analog tuning dial — validate with users before implementation.
- [ ] On-device semantic search — require evidence that ordinary search is inadequate; design model loading UX and bundle budget first.
- [ ] Speech DJ — opt-in only; test privacy, accessibility, interruption, and mute behavior.
- [ ] Generated station artwork — first define source attribution and asset safety; procedural fallback can be a separate module.
- [ ] Scheduled Radio Browser reconciliation — define source terms, data retention, rate limits, repo write permissions, and recovery before any auto-commit workflow.
- [ ] User-managed relay script — document setup and security tradeoffs; never default-route traffic through it.
- [ ] Winamp skin compatibility / JetAudio skin packs — separate product scope with licensing, archive, and binary parsing review.

## 12. Recommended first sprint order

1. [ ] Complete Phase 0 spikes and record decisions.
2. [ ] Create the static shell, shared station contract, test setup, and CI.
3. [ ] Deliver Slice 1 (real search → station selected) end-to-end.
4. [ ] Fan out audio, map, and deck modules against the frozen interfaces; integrate each as it returns.
5. [ ] Deliver Slices 2–4 as connected user journeys, not as isolated component demos.
6. [ ] Complete static deploy smoke test and manual device checklist.
7. [ ] Publish MVP; then use evidence to select the next deferred feature.

**Integration principle:** Parallelize independent implementation work; serialize shared-contract decisions and real-user-path integration. A green test suite is necessary, but only the deployed vertical slice proves the product.
