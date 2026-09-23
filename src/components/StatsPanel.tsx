import type { Atlas, Country } from '../geo/atlas'
import { EQUATOR_KM } from '../geo/sphere'
import { formatCompact, formatKm, formatPercent } from '../lib/format'

interface Props {
  atlas: Atlas
  onSelect: (code: string) => void
}

function CountryLink({ country, onSelect }: { country: Country; onSelect: Props['onSelect'] }) {
  return (
    <button type="button" className="link" onClick={() => onSelect(country.code)}>
      {country.name}
    </button>
  )
}

export default function StatsPanel({ atlas, onSelect }: Props) {
  const { totals, extremes, route } = atlas
  const hemispheres = Object.values(totals.hemispheres).filter(Boolean).length

  return (
    <div className="stats">
      <div className="tiles">
        <div className="tile">
          <b>{totals.visited}</b>
          <span>of {totals.countries} countries &amp; territories on the map</span>
        </div>
        <div className="tile">
          <b>
            {totals.continentsVisited}
            <small>/7</small>
          </b>
          <span>continents · {hemispheres}/4 hemispheres</span>
        </div>
        <div className="tile">
          <b>{formatPercent(totals.populationShare)}</b>
          <span>of the world’s population lives in these countries</span>
        </div>
        <div className="tile">
          <b>{formatPercent(totals.landShare)}</b>
          <span>of Earth’s land area ({formatCompact(totals.visitedLandKm2)} km²)</span>
        </div>
      </div>

      <section aria-labelledby="continents-title">
        <h3 id="continents-title" className="h-mono">By continent</h3>
        <ul className="bars">
          {totals.continents.map((c) => (
            <li key={c.name}>
              <span className="bars__label">{c.name}</span>
              <span className="bars__track" aria-hidden="true">
                <span style={{ width: `${c.total ? (c.visited / c.total) * 100 : 0}%` }} />
              </span>
              <span className="bars__value">
                {c.visited}/{c.total}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="route-title">
        <h3 id="route-title" className="h-mono">The round trip</h3>
        <p className="big-line">
          {formatKm(route.totalKm)}
          <small>≈ {route.laps.toFixed(2)}× around the equator ({formatKm(EQUATOR_KM)})</small>
        </p>
        <p className="muted">
          The shortest loop I can find that leaves {atlas.home.name}, touches every visited country once, and comes
          home. Greedy nearest-neighbour gives {formatKm(route.greedyKm)}; 2-opt cuts that by{' '}
          {formatPercent(1 - route.totalKm / route.greedyKm, 1)}.
        </p>
      </section>

      {extremes && (
        <section aria-labelledby="extremes-title">
          <h3 id="extremes-title" className="h-mono">Extremes</h3>
          <dl className="extremes">
            <div>
              <dt>Farthest north</dt>
              <dd><CountryLink country={extremes.north} onSelect={onSelect} /></dd>
            </div>
            <div>
              <dt>Farthest south</dt>
              <dd><CountryLink country={extremes.south} onSelect={onSelect} /></dd>
            </div>
            <div>
              <dt>Farthest east</dt>
              <dd><CountryLink country={extremes.east} onSelect={onSelect} /></dd>
            </div>
            <div>
              <dt>Farthest west</dt>
              <dd><CountryLink country={extremes.west} onSelect={onSelect} /></dd>
            </div>
            <div className="wide">
              <dt>Farthest from {atlas.home.code}</dt>
              <dd>
                <CountryLink country={extremes.farthestFromHome} onSelect={onSelect} /> ·{' '}
                {formatKm(extremes.farthestFromHome.distanceFromHomeKm)}
              </dd>
            </div>
            <div className="wide">
              <dt>Most distant pair</dt>
              <dd>
                <CountryLink country={extremes.farthestPair.a} onSelect={onSelect} /> ↔{' '}
                <CountryLink country={extremes.farthestPair.b} onSelect={onSelect} /> ·{' '}
                {formatKm(extremes.farthestPair.km)}
              </dd>
            </div>
          </dl>
          <p className="muted small">
            Measured between each country’s area-weighted center. Population figures are Natural Earth estimates.
          </p>
        </section>
      )}
    </div>
  )
}
