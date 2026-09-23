import type { FlightLog } from '../flights/log'
import type { FlightNetwork } from '../flights/network'
import type { Atlas, Country } from '../geo/atlas'
import { formatCompact, formatKm, formatKm2, formatLatLng, pad2 } from '../lib/format'

interface Props {
  atlas: Atlas
  country: Country
  network: FlightNetwork | null
  /** Present only when unlocked; adds visit counts. */
  flightLog: FlightLog | null
  onSelectAirport: (iata: string) => void
  onPrev: () => void
  onNext: () => void
  onClose: () => void
}

export default function CountryCard({
  atlas,
  country,
  network,
  flightLog,
  onSelectAirport,
  onPrev,
  onNext,
  onClose,
}: Props) {
  // Join airports to the country by ISO alpha-2. Counts only when unlocked.
  const airports: { item: { iata: string; name: string; city: string }; count?: number }[] = flightLog
    ? flightLog.airports.filter((a) => a.item.country === country.iso2)
    : (network?.airports ?? []).filter((a) => a.country === country.iso2).map((item) => ({ item }))
  const airportVisits = flightLog ? airports.reduce((acc, a) => acc + (a.count ?? 0), 0) : null
  const total = atlas.totals.visited
  const previous = country.stop ? (country.stop === 1 ? null : atlas.visited[country.stop - 2]) : null
  const legKm = country.stop ? atlas.route.legs[country.stop - 1]?.km : null

  return (
    <article className={`card ${country.visited ? 'card--visited' : ''}`} aria-labelledby="card-title">
      <header className="card__head">
        <span className="card__code">{country.code}</span>
        <span className={`badge ${country.visited ? 'badge--visited' : ''}`}>
          {country.visited ? `Stop ${pad2(country.stop ?? 0)} / ${pad2(total)}` : 'Not yet'}
        </span>
        <button type="button" className="icon-btn card__close" onClick={onClose} aria-label="Close country details">
          ×
        </button>
      </header>

      <h2 id="card-title" className="card__name">{country.name}</h2>
      <p className="card__meta">
        {country.nameEs && country.nameEs !== country.name && <span lang="es">{country.nameEs} · </span>}
        {country.subregion || country.continent}
      </p>

      <dl className="card__grid">
        <div>
          <dt>Population</dt>
          <dd>{country.population ? formatCompact(country.population) : '—'}</dd>
        </div>
        <div>
          <dt>Area</dt>
          <dd>{formatKm2(country.areaKm2)}</dd>
        </div>
        <div>
          <dt>From {atlas.home.code}</dt>
          <dd>{formatKm(country.distanceFromHomeKm)}</dd>
        </div>
        <div>
          <dt>Center</dt>
          <dd>{formatLatLng(country.center.lat, country.center.lng)}</dd>
        </div>
        {airports.length > 0 && (
          <div className="card__wide">
            <dt>
              {airportVisits === null
                ? `Airports · ${airports.length}`
                : `Airports · ${airportVisits} ${airportVisits === 1 ? 'visit' : 'visits'}`}
            </dt>
            <dd className="card__airports">
              {airports.slice(0, 6).map((a) => (
                <button
                  key={a.item.iata}
                  type="button"
                  title={`${a.item.name}, ${a.item.city}`}
                  onClick={() => onSelectAirport(a.item.iata)}
                >
                  {a.item.iata} {a.count !== undefined && <small>{a.count}</small>}
                </button>
              ))}
              {airports.length > 6 && <span>+{airports.length - 6}</span>}
            </dd>
          </div>
        )}
        {legKm != null && (
          <div className="card__wide">
            <dt>Route leg</dt>
            <dd>
              {previous ? previous.name : atlas.home.name} → {country.name} · {formatKm(legKm)}
            </dd>
          </div>
        )}
      </dl>

      <footer className="card__nav">
        <button type="button" className="btn btn--ghost" onClick={onPrev} aria-label="Previous stop">
          ← Prev
        </button>
        <span className="card__hint">
          <kbd>←</kbd> <kbd>→</kbd> route · <kbd>Esc</kbd> close
        </span>
        <button type="button" className="btn btn--ghost" onClick={onNext} aria-label="Next stop">
          Next →
        </button>
      </footer>
    </article>
  )
}
