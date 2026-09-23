import type { Atlas } from '../geo/atlas'
import type { FlightsState } from '../hooks/useFlights'
import { formatKm, formatMs, formatPercent } from '../lib/format'

export const REPO_URL = 'https://github.com/dgonzo14/world_DG'
const source = (path: string) => `${REPO_URL}/blob/main/${path}`

interface Props {
  atlas: Atlas
  fetchMs: number
  flights: FlightsState | null
}

export default function EnginePanel({ atlas, fetchMs, flights }: Props) {
  const { diagnostics: d, route, totals } = atlas
  const stops = totals.visited + 1

  // Cross-check the two datasets: every airport's country should be on the visited list.
  const visitedIso2 = new Set(atlas.visited.map((c) => c.iso2))
  const airportCountries = flights ? [...new Set(flights.log.airports.map((a) => a.item.country))] : []
  const unlisted = airportCountries.filter((iso2) => !visitedIso2.has(iso2))

  const modules = [
    {
      title: 'Spherical polygon area',
      file: 'src/geo/sphere.ts',
      body: 'Areas come from a line integral over each ring on the sphere, not a flat projection, so Iceland and Brazil are measured on equal terms. Holes subtract; multipolygons sum.',
      formula: 'A = R²/2 · Σ (λᵢ₊₁ − λᵢ)(2 + sin φᵢ + sin φᵢ₊₁)',
      metric: `${d.features} polygons · ${d.vertices.toLocaleString()} vertices · ${formatMs(d.geometryMs)}`,
    },
    {
      title: 'Area-weighted centroids',
      file: 'src/geo/sphere.ts',
      body: 'Each country’s camera target is the centroid of its largest landmass, built from a signed triangle fan in 3D. That keeps densely sampled coastlines from dragging the point, and lands the US in Kansas rather than being pulled toward Alaska.',
      formula: 'c = normalize( Σ Aₜ · (o + a + b) / Σ Aₜ )',
      metric: `${totals.countries} label points`,
    },
    {
      title: 'Route optimization (TSP)',
      file: 'src/geo/route.ts',
      body: 'A haversine distance matrix feeds a nearest-neighbour tour, which 2-opt then untangles by reversing segments until no swap of two legs makes the loop shorter.',
      formula: 'Δ = d(a,c) + d(b,d) − d(a,b) − d(c,d) < 0',
      metric: `${route.pairsCompared} pairs · ${route.improvingMoves} swaps in ${route.passes} passes · ${formatKm(route.greedyKm)} → ${formatKm(route.totalKm)} (−${formatPercent(1 - route.totalKm / route.greedyKm, 1)}) · ${formatMs(d.routeMs)}`,
    },
    {
      title: 'Data validation',
      file: 'src/geo/atlas.ts',
      body: 'Codes resolve through a chain of fallback fields because Natural Earth marks France, Norway and Kosovo with “-99”. Every visited code is checked against the polygons, and misses are reported instead of silently ignored.',
      formula: 'iso_a3 → adm0_a3 → … → /^[A-Z]{3}$/',
      metric: `${d.matchedCodes}/${d.matchedCodes + d.unmatchedCodes.length} visited codes matched${d.unmatchedCodes.length ? ` · missing: ${d.unmatchedCodes.join(', ')}` : ''}`,
    },
    ...(flights
      ? [
          {
            title: 'Flight log pipeline',
            file: 'scripts/import-flighty.ts',
            body: 'A build-time script parses my Flighty CSV export, joins each airport to OurAirports coordinates and OpenFlights IANA time zones, and converts local gate times to UTC (DST-aware) for block time and delay. It publishes only month, route, airline and aircraft: no flight numbers, no exact dates, and nothing scheduled in the future.',
            formula: 'local gate time + IANA zone → UTC → block minutes',
            metric: `${flights.log.totals.flights} flights · ${flights.log.totals.airports} airports · ${flights.log.totals.routes} routes · aggregated in ${formatMs(flights.buildMs)} · airports in ${airportCountries.length} countries, ${unlisted.length ? `not on the visited list: ${unlisted.join(', ')}` : 'all on the visited list'}`,
          },
        ]
      : []),
    {
      title: 'Rendering & state',
      file: 'src/components/GlobeView.tsx',
      body: 'three.js via react-globe.gl: extruded country meshes, animated great-circle arcs, and pulse rings. Selection lives in the URL (#/country/JPN), so views are shareable and the back button works. Honors prefers-reduced-motion and falls back to the list without WebGL.',
      formula: 'URL ⇄ selection ⇄ camera',
      metric: `GeoJSON fetched in ${formatMs(fetchMs)} · ${stops} route nodes · ${route.legs.length} arcs`,
    },
  ]

  return (
    <div className="engine">
      <p className="muted">
        Every number on this page is computed in your browser from one GeoJSON file and a {totals.visited}-entry list of
        country codes. These are the pieces doing the work, with timings from this page load.
      </p>

      <ol className="modules">
        {modules.map((m) => (
          <li key={m.title} className="module">
            <h3>{m.title}</h3>
            <p>{m.body}</p>
            <code className="formula">{m.formula}</code>
            <p className="module__metric">{m.metric}</p>
            <a className="module__src" href={source(m.file)} target="_blank" rel="noreferrer">
              {m.file} ↗
            </a>
          </li>
        ))}
      </ol>

      <div className="quality">
        <h3 className="h-mono">Quality gates</h3>
        <ul>
          <li>TypeScript in strict mode across the app and geometry library</li>
          <li>Vitest unit tests for area, distance, centroid, 2-opt, CSV parsing and time zones, plus integration tests on the real datasets</li>
          <li>A test asserts the published flight file contains only the whitelisted, month-precision fields</li>
          <li>ESLint with typescript-eslint and the React hooks rules</li>
          <li>GitHub Actions runs type-check, lint and tests before every Pages deploy</li>
        </ul>
      </div>
    </div>
  )
}
