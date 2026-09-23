import type { AirportDetail } from '../flights/log'
import type { Country } from '../geo/atlas'
import { formatKm, formatMonth } from '../lib/format'

interface Props {
  detail: AirportDetail
  /** Rank by visits, 1-based, and how many airports there are. */
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
  const { airport, routes } = detail
  const maxCount = Math.max(...routes.map((r) => r.count), 1)
  const firstAndLast =
    detail.firstMonth === detail.lastMonth
      ? formatMonth(detail.firstMonth)
      : `${formatMonth(detail.firstMonth)} – ${formatMonth(detail.lastMonth)}`

  return (
    <article className="card card--visited card--airport" aria-labelledby="card-title">
      <header className="card__head">
        <span className="card__code">{airport.iata}</span>
        <span className="badge badge--visited">
          #{rank} of {total} · {detail.visits} {detail.visits === 1 ? 'visit' : 'visits'}
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

      <dl className="card__grid">
        <div>
          <dt>Departures</dt>
          <dd>{detail.departures}</dd>
        </div>
        <div>
          <dt>Arrivals</dt>
          <dd>{detail.arrivals}</dd>
        </div>
        <div>
          <dt>Destinations</dt>
          <dd>{routes.length}</dd>
        </div>
        <div>
          <dt>Airlines</dt>
          <dd title={detail.airlines.map((a) => a.item.name).join(', ')}>
            {detail.airlines.length === 1 ? detail.airlines[0].item.name : detail.airlines.length}
          </dd>
        </div>
        <div className="card__wide">
          <dt>{detail.firstMonth === detail.lastMonth ? 'Visited' : 'First and latest visit'}</dt>
          <dd>{firstAndLast}</dd>
        </div>
      </dl>

      <h3 className="card__sub">Routes from here</h3>
      <ul className="routes-list">
        {routes.slice(0, MAX_ROUTES).map((r) => (
          <li key={r.other.iata}>
            <button
              type="button"
              className="routes-list__row"
              onClick={() => onSelectAirport(r.other.iata)}
              aria-label={`${r.other.iata}, ${r.other.city}: ${r.count} ${r.count === 1 ? 'flight' : 'flights'}, ${formatKm(r.km)}`}
            >
              <span className="routes-list__code">{r.other.iata}</span>
              <span className="routes-list__city">{r.other.city}</span>
              <span className="routes-list__track" aria-hidden="true">
                <span style={{ width: `${(r.count / maxCount) * 100}%` }} />
              </span>
              <span className="routes-list__count">{r.count}</span>
            </button>
          </li>
        ))}
      </ul>
      {routes.length > MAX_ROUTES && <p className="card__more">+{routes.length - MAX_ROUTES} more on the globe</p>}

      <footer className="card__nav">
        <button type="button" className="btn btn--ghost" onClick={onPrev} aria-label="Previous airport">
          ← Prev
        </button>
        <span className="card__hint">
          <kbd>←</kbd> <kbd>→</kbd> by visits · <kbd>Esc</kbd> close
        </span>
        <button type="button" className="btn btn--ghost" onClick={onNext} aria-label="Next airport">
          Next →
        </button>
      </footer>
    </article>
  )
}
