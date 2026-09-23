import type { AirportSummary } from '../flights/network'
import type { Country } from '../geo/atlas'
import { formatKm, formatMonth } from '../lib/format'

interface Props {
  detail: AirportSummary
  /** 1-based position in the prev/next order, and how many airports there are. */
  rank: number
  total: number
  country: Country | null
  onSelectAirport: (iata: string) => void
  onSelectCountry: (code: string) => void
  onPrev: () => void
  onNext: () => void
  onClose: () => void
}

const MAX_ROUTES = 8

export default function AirportCard({
  detail,
  rank,
  total,
  country,
  onSelectAirport,
  onSelectCountry,
  onPrev,
  onNext,
  onClose,
}: Props) {
  const { airport, destinations, stats } = detail
  // Unlocked: bars by flights. Public: bars by distance (no frequency shown).
  const barValue = (d: (typeof destinations)[number]) => d.count ?? d.km
  const maxBar = Math.max(...destinations.map(barValue), 1)

  return (
    <article className="card card--visited card--airport" aria-labelledby="card-title">
      <header className="card__head">
        <span className="card__code">{airport.iata}</span>
        <span className="badge badge--visited">
          {stats
            ? `#${rank} of ${total} · ${stats.visits} ${stats.visits === 1 ? 'visit' : 'visits'}`
            : `${destinations.length} ${destinations.length === 1 ? 'route' : 'routes'}`}
        </span>
        <button type="button" className="icon-btn card__close" onClick={onClose} aria-label="Close airport details">
          ×
        </button>
      </header>

      <h2 id="card-title" className="card__name card__name--airport">
        {airport.name}
      </h2>
      <p className="card__meta">
        {airport.city}
        {country && (
          <>
            {' · '}
            <button type="button" className="link" onClick={() => onSelectCountry(country.code)}>
              {country.name}
            </button>
          </>
        )}
      </p>

      {stats && (
        <dl className="card__grid">
          <div>
            <dt>Departures</dt>
            <dd>{stats.departures}</dd>
          </div>
          <div>
            <dt>Arrivals</dt>
            <dd>{stats.arrivals}</dd>
          </div>
          <div>
            <dt>Destinations</dt>
            <dd>{destinations.length}</dd>
          </div>
          <div>
            <dt>Airlines</dt>
            <dd title={stats.airlines.map((a) => a.name).join(', ')}>
              {stats.airlines.length === 1 ? stats.airlines[0].name : stats.airlines.length}
            </dd>
          </div>
          <div className="card__wide">
            <dt>{stats.firstMonth === stats.lastMonth ? 'Visited' : 'First and latest visit'}</dt>
            <dd>
              {stats.firstMonth === stats.lastMonth
                ? formatMonth(stats.firstMonth)
                : `${formatMonth(stats.firstMonth)} – ${formatMonth(stats.lastMonth)}`}
            </dd>
          </div>
        </dl>
      )}

      <h3 className="card__sub">{stats ? 'Routes from here' : 'Routes from here, longest first'}</h3>
      <ul className="routes-list">
        {destinations.slice(0, MAX_ROUTES).map((d) => (
          <li key={d.other.iata}>
            <button
              type="button"
              className="routes-list__row"
              onClick={() => onSelectAirport(d.other.iata)}
              aria-label={`${d.other.iata}, ${d.other.city}: ${
                d.count !== undefined ? `${d.count} ${d.count === 1 ? 'flight' : 'flights'}, ` : ''
              }${formatKm(d.km)}`}
            >
              <span className="routes-list__code">{d.other.iata}</span>
              <span className="routes-list__city">{d.other.city}</span>
              <span className="routes-list__track" aria-hidden="true">
                <span style={{ width: `${(barValue(d) / maxBar) * 100}%` }} />
              </span>
              <span className="routes-list__count">
                {d.count !== undefined ? d.count : `${Math.round(d.km / 100) / 10}k`}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {destinations.length > MAX_ROUTES && (
        <p className="card__more">+{destinations.length - MAX_ROUTES} more on the globe</p>
      )}

      <footer className="card__nav">
        <button type="button" className="btn btn--ghost" onClick={onPrev} aria-label="Previous airport">
          ← Prev
        </button>
        <span className="card__hint">
          <kbd>←</kbd> <kbd>→</kbd> {stats ? 'by visits' : 'by routes'} · <kbd>Esc</kbd> close
        </span>
        <button type="button" className="btn btn--ghost" onClick={onNext} aria-label="Next airport">
          Next →
        </button>
      </footer>
    </article>
  )
}
