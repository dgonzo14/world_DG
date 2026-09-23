# DG Atlas

An interactive 3D globe of every country I've visited, with two views:

- **Loop:** the shortest round trip from St. Louis that touches every country, planned by a route optimizer.
- **Flights:** every flight I've actually taken since January 2024, imported from my Flighty log, with a replay that animates them in order.

**Live:** https://dgonzo14.github.io/world_DG/

Every number on the page is computed in the browser from one GeoJSON file and a list of ISO-3 country codes. Nothing is hard-coded, so adding a trip is a one-line change to `src/data/visitedCountries.ts`.

## What's interesting in here

| Module | What it does |
|---|---|
| [`src/geo/sphere.ts`](src/geo/sphere.ts) | Spherical geometry from scratch: haversine distance, polygon area as a line integral on the sphere (Chamberlain & Duquette 2007), and area-weighted centroids from a signed 3D triangle fan. |
| [`src/geo/route.ts`](src/geo/route.ts) | Travelling-salesman route: nearest-neighbour construction, then 2-opt local search until no two-edge swap improves the loop. It cuts the greedy tour by about 19%. |
| [`src/geo/atlas.ts`](src/geo/atlas.ts) | Turns raw Natural Earth features into a typed model: code resolution with fallbacks, population and land share, continent tallies, extremes, route stops, and timing diagnostics. |
| [`scripts/import-flighty.ts`](scripts/import-flighty.ts) | Data pipeline: parses the Flighty CSV, joins airports to OurAirports coordinates and OpenFlights IANA time zones (falling back through ICAO codes, original idents and single-zone countries), converts local gate times to UTC for block time and delay, and writes a privacy-filtered `flights.json`. |
| [`src/flights/`](src/flights/) | RFC 4180 CSV parser, DST-aware local-time → UTC conversion, and the aggregation behind the Flights tab (routes as unordered pairs, zero-filled months, aircraft families, punctuality). |
| [`src/components/GlobeView.tsx`](src/components/GlobeView.tsx) | three.js via react-globe.gl: extruded countries, animated great-circle arcs, pulse rings, camera fly-to. |
| [`src/hooks/useHashSelection.ts`](src/hooks/useHashSelection.ts) | Selection lives in the URL (`#/country/JPN`) through `useSyncExternalStore`, so views are shareable and the back button works. |

The **Under the hood** tab on the site shows these modules with live metrics from the current page load.

### A bug the rewrite fixed

Natural Earth gives France, Norway, Kosovo, N. Cyprus and Somaliland an `iso_a3` of `"-99"`. The old helper returned the first non-empty field, got `-99`, rejected it, and gave up. Adding `FRA` would have silently done nothing. Codes now fall through `iso_a3 → adm0_a3 → …` until one is valid, and any visited code without a matching polygon is reported. Both behaviours are covered by tests.

## Features

- Click, search (English or Spanish, accent-insensitive) or step (`←` / `→`) through countries
- **Fly the route** (`T`): a guided tour along the optimized loop, with pause, skip and progress
- **Flights mode** (`F`): flown routes weighted by frequency, airports sized by visits, and a **replay** (`T`) of every flight in order, synced with the monthly chart
- Flights tab: monthly chart (with a table view), most-flown routes, busiest airports, aircraft families, airlines, records and punctuality
- **Airports are interactive:** click a marker, a chip or a list row to open the airport card (departures, arrivals, first and latest visit, airlines, every route from there). Its routes light up on the globe while the rest dims; `←` `→` step through airports by visits
- Country cards list the airports I've used there, and each one links to its airport
- Stats: share of world population and land area, continent coverage, hemispheres, extremes, most distant pair
- Keyboard shortcuts: `/` search, `←` `→` step, `T` tour/replay, `F` flights mode, `Esc` close
- Shareable URLs: `#/country/JPN` or `#/airport/ATL` select a country or airport; `?view=flights` opens the flight log
- Honors `prefers-reduced-motion`, and falls back to the list when WebGL is unavailable
- Code-split: the UI shell loads first and three.js streams in after it

## Updating the flight log

Export your flights from Flighty as a CSV, then:

```bash
npm run import:flights -- ~/Downloads/FlightyExport.csv
```

The raw CSV stays on your machine (`*.csv` is gitignored). What gets published is deliberately coarse:

- **Future flights are dropped** before anything is written, so upcoming travel never appears online
- Dates are cut to the month
- Flight numbers, gates, terminals, seats, booking codes and Flighty IDs are discarded
- A test fails the build if `flights.json` ever contains a field outside the whitelist or a date finer than a month

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm run check      # type-check + lint + tests
npm run build
```

Stack: React 19, TypeScript (strict), Vite, three.js / react-globe.gl, Vitest, ESLint (typescript-eslint).

## Tests

`npm test` runs the Vitest suite:

- **Geometry:** closed-form areas for lat/lng boxes and a sphere octant, winding invariance, holes, antimeridian centroids, and resistance to uneven vertex density.
- **Routing:** valid permutations, a fixed start, never worse than greedy, and a verified 2-opt local optimum on seeded random inputs.
- **Flights:** CSV edge cases (quotes, embedded newlines, BOM), time zones across DST and the date line, a real cross-zone block time, and route/month/punctuality aggregation.
- **Integration:** the real datasets (every visited code resolves; Earth's land area and known country areas come out in the right range; the published flight file holds only whitelisted, month-precision fields).

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`. Type-check, lint and tests must pass before Vite builds and publishes `dist/` to GitHub Pages.

## Data

- `public/data/countries.geojson`: Natural Earth 1:110m admin-0 countries (via Visionscarto World Atlas), with Western Sahara kept separate from Morocco. Population figures are Natural Earth estimates.
- `public/data/flights.json`: generated by `npm run import:flights`, using [OurAirports](https://ourairports.com/data/) (public domain) and [OpenFlights](https://openflights.org/data) (ODbL) airport data.
