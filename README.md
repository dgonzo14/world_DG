# DG Atlas

An interactive 3D globe of every country I've visited, with two views:

- **Loop:** the shortest round trip from St. Louis that touches every country, planned by a route optimizer.
- **Flights:** every airport and route I've flown, imported from my Flighty log. The public view shows the network only; the detailed log (visit counts, dates, the monthly chart and a replay of every flight) is encrypted and unlocks with an access code.

**Live:** https://dgonzo14.github.io/world_DG/

Every number on the page is computed in the browser from one GeoJSON file and a list of ISO-3 country codes. Nothing is hard-coded, so adding a trip is a one-line change to `src/data/visitedCountries.ts`.

## What's interesting in here

| Module | What it does |
|---|---|
| [`src/geo/sphere.ts`](src/geo/sphere.ts) | Spherical geometry from scratch: haversine distance, polygon area as a line integral on the sphere (Chamberlain & Duquette 2007), and area-weighted centroids from a signed 3D triangle fan. |
| [`src/geo/route.ts`](src/geo/route.ts) | Travelling-salesman route: nearest-neighbour construction, then 2-opt local search until no two-edge swap improves the loop. It cuts the greedy tour by about 19%. |
| [`src/geo/atlas.ts`](src/geo/atlas.ts) | Turns raw Natural Earth features into a typed model: code resolution with fallbacks, population and land share, continent tallies, extremes, route stops, and timing diagnostics. |
| [`scripts/import-flighty.ts`](scripts/import-flighty.ts) | Data pipeline: parses the Flighty CSV, joins airports to OurAirports coordinates and OpenFlights IANA time zones (falling back through ICAO codes, original idents and single-zone countries), converts local gate times to UTC for block time and delay, and writes a privacy-filtered `flights.json`. |
| [`src/flights/network.ts`](src/flights/network.ts), [`vault.ts`](src/flights/vault.ts) | The privacy boundary. `toPublicFile` reduces the log to airports and unique, alphabetical routes, so the public file is byte-for-byte identical whether a route was flown once or a hundred times. The detailed log is sealed with AES-256-GCM under a PBKDF2-SHA256 key (600k iterations) and decrypted locally with Web Crypto. |
| [`src/flights/`](src/flights/) | RFC 4180 CSV parser, DST-aware local-time → UTC conversion, and the aggregation behind the Flights tab (routes as unordered pairs, zero-filled months, aircraft families, punctuality). |
| [`src/components/GlobeView.tsx`](src/components/GlobeView.tsx) | three.js via react-globe.gl: extruded countries, animated great-circle arcs, pulse rings, camera fly-to. |
| [`src/hooks/useHashSelection.ts`](src/hooks/useHashSelection.ts) | Selection lives in the URL (`#/country/JPN`) through `useSyncExternalStore`, so views are shareable and the back button works. |

The **Under the hood** tab on the site shows these modules with live metrics from the current page load.

### A bug the rewrite fixed

Natural Earth gives France, Norway, Kosovo, N. Cyprus and Somaliland an `iso_a3` of `"-99"`. The old helper returned the first non-empty field, got `-99`, rejected it, and gave up. Adding `FRA` would have silently done nothing. Codes now fall through `iso_a3 → adm0_a3 → …` until one is valid, and any visited code without a matching polygon is reported. Both behaviours are covered by tests.

## Features

- Click, search (English or Spanish, accent-insensitive) or step (`←` / `→`) through countries
- **Fly the route** (`T`): a guided tour along the optimized loop, with pause, skip and progress
- **Flights mode** (`F`): every route flown and every airport used. Once unlocked, routes are weighted by frequency, airports are sized by visits, and a **replay** (`T`) flies every flight in order, synced with the monthly chart
- Flights tab: monthly chart (with a table view), most-flown routes, busiest airports, aircraft families, airlines, records and punctuality
- **Airports are interactive:** hover for the name, and click (or tap) a marker, chip or list row to open the airport card with every route from there. Its routes light up on the globe while the rest dims; `←` `→` step through airports. Unlocked, the card adds departures, arrivals, first and latest visit, and airlines
- **Touch-friendly:** 44 px tap targets on touch screens, with a tap resolving to the nearest dot where targets overlap
- Country cards list the airports I've used there, and each one links to its airport
- Stats: share of world population and land area, continent coverage, hemispheres, extremes, most distant pair
- Keyboard shortcuts: `/` search, `←` `→` step, `T` tour/replay, `F` flights mode, `Esc` close
- Shareable URLs: `#/country/JPN` or `#/airport/ATL` select a country or airport; `?view=flights` opens the flight log
- Honors `prefers-reduced-motion`, and falls back to the list when WebGL is unavailable
- Code-split: the UI shell loads first and three.js streams in after it

## Updating the flight log

Export your flights from Flighty as a CSV, then run:

```bash
FLIGHTS_CODE='XXXX-XXXX-XXXX' npm run import:flights -- ~/Downloads/FlightyExport.csv
```

Leave out `FLIGHTS_CODE` to be prompted for it without echo. This writes two files:

| File | Contents |
|---|---|
| `public/data/flights.public.json` | Airports and unique routes only: alphabetical, no counts, no dates |
| `public/data/flights.vault.json` | The detailed log, encrypted. It unlocks in the browser with the access code |

The raw CSV and the access code never leave your machine (`*.csv` is gitignored). Before anything is written:

- **Future flights are dropped**, so upcoming travel never appears online, not even encrypted
- Dates are cut to the month
- Flight numbers, gates, terminals, seats, booking codes and Flighty IDs are discarded

Tests fail the build if the public file ever holds a field outside its whitelist or anything ordered by frequency, if a plaintext log appears in `public/data/`, or if the vault envelope changes shape.

**On the access code:** GitHub Pages is a static host, so anyone can download the vault file and guess offline. The key derivation makes each guess slow, but only a high-entropy code keeps the log private. Use something like `XXXX-XXXX-XXXX` from a password manager, not a short PIN.

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm run check      # type-check + lint + tests
npm run build
npm run build:topology   # regenerate public/data/countries.topo.json from data/countries.geojson
```

Stack: React 19, TypeScript (strict), Vite, three.js / react-globe.gl, Vitest, ESLint (typescript-eslint).

## Tests

`npm test` runs the Vitest suite:

- **Geometry:** closed-form areas for lat/lng boxes and a sphere octant, winding invariance, holes, antimeridian centroids, and resistance to uneven vertex density.
- **Routing:** valid permutations, a fixed start, never worse than greedy, and a verified 2-opt local optimum on seeded random inputs.
- **Flights:** CSV edge cases (quotes, embedded newlines, BOM), time zones across DST and the date line, a real cross-zone block time, route/month/punctuality aggregation, and air returns (a flight that lands where it left).
- **Privacy:** the public file is identical whether a route was flown once or many times; the vault round-trips, rejects wrong codes and tampering, never repeats a salt or IV, and never contains plaintext.
- **Integration:** the real datasets. Every visited code resolves; Earth's land area and known country areas come out in the right range; TopoJSON quantization keeps every country within 0.5% of its area; the published files hold only what they should. With `FLIGHTS_CODE` set, one more test decrypts the vault and checks it matches the public network.

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`. Type-check, lint and tests must pass before Vite builds and publishes `dist/` to GitHub Pages.

## Data

- `data/countries.geojson`: Natural Earth 1:110m admin-0 countries (via Visionscarto World Atlas), with Western Sahara kept separate from Morocco. `npm run build:topology` converts it to `public/data/countries.topo.json` (TopoJSON, quantized, trimmed to the fields the app reads): 719 KB → 132 KB, or 158 KB → 44 KB gzipped. Population figures are Natural Earth estimates.
- `public/data/flights.*.json`: generated by `npm run import:flights`, using [OurAirports](https://ourairports.com/data/) (public domain) and [OpenFlights](https://openflights.org/data) (ODbL) airport data.
