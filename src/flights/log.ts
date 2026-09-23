import { EQUATOR_KM, haversineKm } from '../geo/sphere'
import type { AirportSummary } from './network'
import type { AirportRef, FlightEntry, FlightsFile } from './types'

/** Average Earth–Moon distance. */
export const MOON_KM = 384_400
/** Airline convention: within 15 minutes of schedule counts as on time. */
export const ON_TIME_MIN = 15

export interface Flight extends FlightEntry {
  index: number
  origin: AirportRef
  destination: AirportRef
  km: number
}

export interface RouteTally {
  /** Alphabetical pair key, e.g. "ATL-RDU": both directions count as one route. */
  key: string
  a: AirportRef
  b: AirportRef
  count: number
  km: number
}

export interface Tally<T> {
  item: T
  count: number
}

export interface MonthTally {
  month: string
  count: number
  km: number
}

export interface FlightLog {
  flights: Flight[]
  airports: Tally<AirportRef>[]
  routes: RouteTally[]
  months: MonthTally[]
  airlines: Tally<{ code: string; name: string }>[]
  aircraft: Tally<string>[]
  totals: {
    flights: number
    km: number
    laps: number
    moonShare: number
    blockHours: number
    airports: number
    routes: number
    countries: number
    airlines: number
    aircraftTypes: number
    /** Flights that ended where they started (air returns). */
    returnedToOrigin: number
  }
  records: {
    longest: Flight
    shortest: Flight
    longestBlock: Flight | null
    busiestMonth: MonthTally
    topRoute: RouteTally
  } | null
  punctuality: {
    measured: number
    onTimeShare: number
    earlyShare: number
    medianMin: number
    worstMin: number
  } | null
  first: string
  through: string
}

/** Collapse variants into families: "Airbus A350-900" → "Airbus A350", "Boeing 737 MAX 8" → "Boeing 737 MAX". */
export function aircraftFamily(name: string): string {
  const n = name.trim().replace(/\s+/g, ' ')
  const patterns: RegExp[] = [
    /^(Boeing 7\d7 MAX)/,
    /^(Boeing 7\d7)/,
    /^(Airbus A3\d\d)/,
    /^(Airbus A220)/,
    /^(Bombardier CRJ)/,
    /^(Embraer E?1\d\d)/,
  ]
  for (const pattern of patterns) {
    const match = pattern.exec(n)
    if (match) return match[1].replace(/Embraer (\d)/, 'Embraer E$1')
  }
  return n
}

/** Every month from `first` to `last` inclusive, so gaps render as zero bars instead of disappearing. */
export function monthRange(first: string, last: string): string[] {
  const out: string[] = []
  let [y, m] = first.split('-').map(Number)
  const [ly, lm] = last.split('-').map(Number)
  while (y < ly || (y === ly && m <= lm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return out
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function tally<T>(items: T[], key: (item: T) => string): Tally<T>[] {
  const map = new Map<string, Tally<T>>()
  for (const item of items) {
    const k = key(item)
    const entry = map.get(k)
    if (entry) entry.count++
    else map.set(k, { item, count: 1 })
  }
  return [...map.values()].sort((a, b) => b.count - a.count || key(a.item).localeCompare(key(b.item)))
}

export function buildFlightLog(file: FlightsFile): FlightLog {
  const flights: Flight[] = file.flights
    .filter((f) => file.airports[f.from] && file.airports[f.to])
    .map((f, index) => {
      const origin = file.airports[f.from]
      const destination = file.airports[f.to]
      return { ...f, index, origin, destination, km: haversineKm(origin, destination) }
    })

  // A flight that lands back where it left (an air return) is still a flight,
  // but it isn't a route and shouldn't count its airport twice.
  const isReturn = (f: Flight) => f.from === f.to
  const routeMap = new Map<string, RouteTally>()
  for (const f of flights) {
    if (isReturn(f)) continue
    const [a, b] = [f.origin, f.destination].sort((x, y) => x.iata.localeCompare(y.iata))
    const key = `${a.iata}-${b.iata}`
    const route = routeMap.get(key)
    if (route) route.count++
    else routeMap.set(key, { key, a, b, count: 1, km: f.km })
  }
  const routes = [...routeMap.values()].sort((x, y) => y.count - x.count || y.km - x.km)

  const airports = tally(
    flights.flatMap((f) => (isReturn(f) ? [f.origin] : [f.origin, f.destination])),
    (a) => a.iata,
  )

  const first = flights[0]?.month ?? file.through
  const byMonth = new Map<string, MonthTally>(
    (flights.length ? monthRange(first, file.through) : []).map((month) => [month, { month, count: 0, km: 0 }]),
  )
  for (const f of flights) {
    const m = byMonth.get(f.month)
    if (m) {
      m.count++
      m.km += f.km
    }
  }
  const months = [...byMonth.values()]

  const airlines = tally(
    flights.map((f) => ({ code: f.airline, name: file.airlines[f.airline] ?? f.airline })),
    (a) => a.code,
  )
  const aircraft = tally(
    flights.filter((f) => f.aircraft).map((f) => aircraftFamily(f.aircraft!)),
    (a) => a,
  )

  const km = flights.reduce((acc, f) => acc + f.km, 0)
  const blockMinutes = flights.reduce((acc, f) => acc + (f.blockMin ?? 0), 0)
  const delays = flights.map((f) => f.arrDelayMin).filter((d): d is number => d !== null)
  const withBlock = flights.filter((f) => f.blockMin !== null)
  const flown = flights.filter((f) => !isReturn(f))

  return {
    flights,
    airports,
    routes,
    months,
    airlines,
    aircraft,
    totals: {
      flights: flights.length,
      km,
      laps: km / EQUATOR_KM,
      moonShare: km / MOON_KM,
      blockHours: blockMinutes / 60,
      airports: airports.length,
      routes: routes.length,
      countries: new Set(airports.map((a) => a.item.country)).size,
      airlines: airlines.length,
      aircraftTypes: aircraft.length,
      returnedToOrigin: flights.length - flown.length,
    },
    records: flown.length
      ? {
          longest: flown.reduce((best, f) => (f.km > best.km ? f : best)),
          shortest: flown.reduce((best, f) => (f.km < best.km ? f : best)),
          longestBlock: withBlock.length
            ? withBlock.reduce((best, f) => (f.blockMin! > best.blockMin! ? f : best))
            : null,
          busiestMonth: months.reduce((best, m) => (m.count > best.count ? m : best)),
          topRoute: routes[0],
        }
      : null,
    punctuality: delays.length
      ? {
          measured: delays.length,
          onTimeShare: delays.filter((d) => d <= ON_TIME_MIN).length / delays.length,
          earlyShare: delays.filter((d) => d < 0).length / delays.length,
          medianMin: median(delays),
          worstMin: Math.max(...delays),
        }
      : null,
    first,
    through: file.through,
  }
}

/** Everything the airport card needs, derived from the chronological flight list. */
export function airportDetail(log: FlightLog, iata: string): AirportSummary | null {
  const flights = log.flights.filter((f) => f.from === iata || f.to === iata)
  if (flights.length === 0) return null
  const airport = flights[0].from === iata ? flights[0].origin : flights[0].destination

  const destinations = new Map<string, { other: AirportRef; count: number; km: number }>()
  for (const f of flights) {
    const other = f.from === iata ? f.destination : f.origin
    if (other.iata === iata) continue
    const route = destinations.get(other.iata)
    if (route) route.count++
    else destinations.set(other.iata, { other, count: 1, km: f.km })
  }
  const byCode = new Map(log.airlines.map((a) => [a.item.code, a.item]))
  const airlines = tally(
    flights.map((f) => byCode.get(f.airline) ?? { code: f.airline, name: f.airline }),
    (a) => a.code,
  ).map((t) => ({ ...t.item, count: t.count }))

  return {
    airport,
    destinations: [...destinations.values()].sort(
      (a, b) => b.count - a.count || a.other.iata.localeCompare(b.other.iata),
    ),
    stats: {
      visits: flights.length,
      departures: flights.filter((f) => f.from === iata).length,
      arrivals: flights.filter((f) => f.to === iata).length,
      firstMonth: flights[0].month,
      lastMonth: flights[flights.length - 1].month,
      airlines,
    },
  }
}
