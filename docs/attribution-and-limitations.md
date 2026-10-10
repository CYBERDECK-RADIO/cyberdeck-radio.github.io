# Attribution, limitations, and troubleshooting

CyberDeck Radio is a static, client-only receiver. This page records where its
data comes from, what it deliberately does not do, and how to work around the
streams that browsers refuse to play.

## Source attribution

| Source | Used for | Link |
| --- | --- | --- |
| radio-browser.info | Station directory search (name, country, genre) | https://www.radio-browser.info/ |
| Natural Earth | Country outlines drawn on the receiver map | https://www.naturalearthdata.com/ |
| MapLibre GL JS | Map rendering (open-source, BSD-3-Clause) | https://maplibre.org/ |

The station directory is queried live from the public radio-browser.info API
(`https://de1.api.radio-browser.info`). CyberDeck Radio does not host, proxy, or
re-broadcast any audio; playback connects the browser directly to each station's
own stream URL. The footer links back to radio-browser.info as its API terms
request.

## Known limitations

- **HTTP-only streams are skipped on the HTTPS site.** A page served over HTTPS
  cannot play an `http://` stream (browser mixed-content blocking). The player
  filters to `https://` candidates and reports a signal error when a station has
  none. This is intentional and is not worked around with a public proxy.
- **Geo-restricted streams may fail.** Some broadcasters only serve certain
  regions. The browser receives a network error and the deck shows `SIGNAL LOST`.
- **The visualizer is simulated.** Live spectrum analysis needs the Web Audio
  API to read the stream, which requires CORS permission from the station's
  server. Most public streams do not grant it, so the deck shows a clearly
  labeled `SIMULATED` spectrum. An `analyser` mode exists but is only selected
  when a working Web Audio connection is actually established.
- **Playback needs an explicit action.** Browsers block autoplay with sound, so
  selecting a station never starts audio — only the play control does. A blocked
  autoplay attempt becomes a recoverable error, not a silent failure.
- **No equalizer, no offline mode, no accounts.** These are out of scope for the
  MVP and are not stubbed behind hidden flags.

## Troubleshooting

- **No sound after pressing play.** Check the volume slider and the device
  output. If the deck shows `SIGNAL LOST`, the station's stream is unreachable
  from your network — try another result.
- **A station never plays but others do.** It is likely HTTP-only or
  geo-restricted (see above). Pick a different station.
- **The spectrum never moves with the music.** Expected: it is simulated. See
  "The visualizer is simulated" above.
- **The map is blank.** The map falls back to a flat list when WebGL is
  unavailable; search, selection, and playback keep working.

## Privacy and scope confirmation

- **No telemetry or analytics.** The app ships no analytics, tracking, or
  third-party scripts beyond the map library and the station API it calls.
- **No PWA or service worker.** There is no `manifest`, no service worker, and
  no install prompt.
- **No offline-stream claims.** Playback always requires a live network
  connection to the station.
