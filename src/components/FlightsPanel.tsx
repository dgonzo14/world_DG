import type { FlightLog } from '../flights/log'
import { ON_TIME_MIN } from '../flights/log'
import type { FlightNetwork } from '../flights/network'
import { formatCompact, formatDuration, formatKm, formatMonth, formatPercent } from '../lib/format'
import MonthlyChart from './MonthlyChart'
import UnlockForm from './UnlockForm'

interface Props {
  network: FlightNetwork
  /** Present only when unlocked. */
  log: FlightLog | null
  replayMonth: string | null
  selectedAirport: string | null
  onSelectAirport: (iata: string) => void
  onUnlock: (code: string) => Promise<void>
  onLock: () => void
}

interface BarRow {
  key: string
  label: string
  detail?: string
  value: number
}

/**
 * Single-series horizontal bars: one hue, values in text ink at the tip.
 * With `onSelect`, each row is a button.
 */
function Bars({
  rows,
  unit,
  onSelect,
  selectedKey,
}: {
  rows: BarRow[]
  unit: string
  onSelect?: (key: string) => void
  selectedKey?: string | null
}) {
  const max = Math.max(...rows.map((r) => r.value), 1)
  return (
    <ul className={`hbars ${onSelect ? 'hbars--interactive' : ''}`}>
      {rows.map((r) => {
        const content = (
          <>
            <span className="hbars__label">
              {r.label}
              {r.detail && <small>{r.detail}</small>}
            </span>
            <span className="hbars__track" aria-hidden="true">
              <span style={{ width: `${(r.value / max) * 100}%` }} />
            </span>
            <span className="hbars__value">{r.value}</span>
          </>
        )
        return (
          <li key={r.key} title={`${r.label}: ${r.value} ${unit}`}>
            {onSelect ? (
              <button
                type="button"
                className="hbars__row"
                aria-pressed={selectedKey === r.key}
                onClick={() => onSelect(r.key)}
              >
                {content}
              </button>
            ) : (
              content
            )}
          </li>
        )
      })}
    </ul>
  )
}

function AirportChips({
  airports,
  selectedAirport,
  onSelectAirport,
}: {
  airports: { iata: string; name: string; city: string; count?: number }[]
  selectedAirport: string | null
  onSelectAirport: (iata: string) => void
}) {
  return (
    <ul className="ap-chips">
      {airports.map((a) => (
        <li key={a.iata}>
          <button
            type="button"
            aria-pressed={selectedAirport === a.iata}
            title={`${a.name}, ${a.city}`}
            onClick={() => onSelectAirport(a.iata)}
          >
            {a.iata} {a.count !== undefined && <small>{a.count}</small>}
          </button>
        </li>
      ))}
    </ul>
  )
}

/** What anyone can see: the route network, with no frequency or dates. */
function PublicFlights({ network, selectedAirport, onSelectAirport, onUnlock }: Omit<Props, 'log' | 'replayMonth' | 'onLock'>) {
  const { totals } = network
  const longest = [...network.routes].sort((a, b) => b.km - a.km).slice(0, 6)
  const alphabetical = [...network.airports].sort((a, b) => a.iata.localeCompare(b.iata))
  return (
    <div className="stats">
      <p className="muted">Every airport and route in my flight log. Select any airport to see where it connects.</p>
      <div className="tiles">
        <div className="tile">
          <b>{totals.airports}</b>
          <span>airports in {totals.countries} countries</span>
        </div>
        <div className="tile">
          <b>{totals.routes}</b>
          <span>distinct routes flown</span>
        </div>
      </div>

      <section aria-labelledby="longest-title">
        <h3 id="longest-title" className="h-mono">Longest routes</h3>
        <Bars
          unit="km"
          rows={longest.map((r) => ({
            key: r.key,
            label: `${r.a.iata} ⇄ ${r.b.iata}`,
            detail: `${r.a.city} · ${r.b.city}`,
            value: Math.round(r.km),
          }))}
        />
      </section>

      <section aria-labelledby="all-airports-title">
        <h3 id="all-airports-title" className="h-mono">
          All {totals.airports} airports
        </h3>
        <AirportChips airports={alphabetical} selectedAirport={selectedAirport} onSelectAirport={onSelectAirport} />
      </section>

      <UnlockForm onUnlock={onUnlock} />
    </div>
  )
}

export default function FlightsPanel(props: Props) {
  const { log, replayMonth, selectedAirport, onSelectAirport, onLock } = props
  if (!log) return <PublicFlights {...props} />
  const { totals, records, punctuality } = log
  const otherAirlines = log.airlines.slice(5).reduce((acc, a) => acc + a.count, 0)

  return (
    <div className="stats">
      <div className="unlocked">
        <p className="muted">
          Every flight in my Flighty log from {formatMonth(log.first)} to {formatMonth(log.through)}. Distances are
          great circles between airports; time is gate to gate, converted to UTC.
        </p>
        <button type="button" className="btn btn--ghost" onClick={onLock}>
          Lock
        </button>
      </div>

      <div className="tiles">
        <div className="tile">
          <b>{totals.flights}</b>
          <span>
            flights on {totals.airlines} airlines and {totals.aircraftTypes} aircraft families
          </span>
        </div>
        <div className="tile">
          <b>{formatCompact(totals.km)}</b>
          <span>
            km flown · {totals.laps.toFixed(1)}× around the equator,{' '}
            {totals.moonShare >= 1
              ? `${totals.moonShare.toFixed(2)}× the distance to the Moon`
              : `${formatPercent(totals.moonShare)} of the way to the Moon`}
          </span>
        </div>
        <div className="tile">
          <b>{Math.round(totals.blockHours)}</b>
          <span>hours gate to gate, about {(totals.blockHours / 24).toFixed(1)} days</span>
        </div>
        <div className="tile">
          <b>{totals.airports}</b>
          <span>
            airports in {totals.countries} countries · {totals.routes} distinct routes
          </span>
        </div>
      </div>

      <MonthlyChart months={log.months} highlight={replayMonth} />

      <section aria-labelledby="routes-title">
        <h3 id="routes-title" className="h-mono">Most-flown routes</h3>
        <Bars
          unit="flights"
          rows={log.routes.slice(0, 6).map((r) => ({
            key: r.key,
            label: `${r.a.iata} ⇄ ${r.b.iata}`,
            detail: `${r.a.city} · ${r.b.city} · ${formatKm(r.km)}`,
            value: r.count,
          }))}
        />
      </section>

      <section aria-labelledby="airports-title">
        <h3 id="airports-title" className="h-mono">Busiest airports (arrivals + departures)</h3>
        <Bars
          onSelect={onSelectAirport}
          selectedKey={selectedAirport}
          unit="visits"
          rows={log.airports.slice(0, 8).map((a) => ({
            key: a.item.iata,
            label: a.item.iata,
            detail: a.item.city,
            value: a.count,
          }))}
        />
      </section>

      <section aria-labelledby="all-airports-title">
        <h3 id="all-airports-title" className="h-mono">
          All {log.airports.length} airports
        </h3>
        <AirportChips
          airports={log.airports.map((a) => ({ ...a.item, count: a.count }))}
          selectedAirport={selectedAirport}
          onSelectAirport={onSelectAirport}
        />
      </section>

      <section aria-labelledby="fleet-title">
        <h3 id="fleet-title" className="h-mono">Aircraft families</h3>
        <Bars
          unit="flights"
          rows={log.aircraft.slice(0, 8).map((a) => ({ key: a.item, label: a.item, value: a.count }))}
        />
      </section>

      <section aria-labelledby="airlines-title">
        <h3 id="airlines-title" className="h-mono">Airlines</h3>
        <Bars
          unit="flights"
          rows={[
            ...log.airlines.slice(0, 5).map((a) => ({ key: a.item.code, label: a.item.name, value: a.count })),
            ...(otherAirlines
              ? [{ key: 'other', label: `${log.airlines.length - 5} others`, value: otherAirlines }]
              : []),
          ]}
        />
      </section>

      {records && (
        <section aria-labelledby="records-title">
          <h3 id="records-title" className="h-mono">Records</h3>
          <dl className="extremes">
            <div className="wide">
              <dt>Longest flight</dt>
              <dd>
                {records.longest.origin.city} → {records.longest.destination.city} · {formatKm(records.longest.km)}
                {records.longest.blockMin !== null && ` · ${formatDuration(records.longest.blockMin)}`}
              </dd>
            </div>
            {records.longestBlock && records.longestBlock !== records.longest && (
              <div className="wide">
                <dt>Longest time aboard</dt>
                <dd>
                  {records.longestBlock.origin.city} → {records.longestBlock.destination.city} ·{' '}
                  {formatDuration(records.longestBlock.blockMin!)}
                </dd>
              </div>
            )}
            <div>
              <dt>Shortest hop</dt>
              <dd>
                {records.shortest.from} → {records.shortest.to} · {formatKm(records.shortest.km)}
              </dd>
            </div>
            {totals.returnedToOrigin > 0 && (
              <div>
                <dt>Air returns</dt>
                <dd>
                  {totals.returnedToOrigin} {totals.returnedToOrigin === 1 ? 'flight' : 'flights'} landed back at
                  the origin
                </dd>
              </div>
            )}
            <div>
              <dt>Busiest month</dt>
              <dd>
                {formatMonth(records.busiestMonth.month)} · {records.busiestMonth.count} flights
              </dd>
            </div>
          </dl>
        </section>
      )}

      {punctuality && (
        <section aria-labelledby="punctual-title">
          <h3 id="punctual-title" className="h-mono">Punctuality</h3>
          <p className="big-line">
            {formatPercent(punctuality.onTimeShare)}
            <small>
              arrived within {ON_TIME_MIN} min of schedule ({punctuality.measured} flights with actual times)
            </small>
          </p>
          <p className="muted">
            {formatPercent(punctuality.earlyShare)} got to the gate early. The median arrival was{' '}
            {punctuality.medianMin <= 0
              ? `${Math.abs(punctuality.medianMin)} min early`
              : `${punctuality.medianMin} min late`}
            , and the worst was {formatDuration(punctuality.worstMin)} late.
          </p>
        </section>
      )}
    </div>
  )
}
