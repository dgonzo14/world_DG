import { describe, expect, it } from 'vitest'
import { aircraftFamily, airportDetail, buildFlightLog, monthRange } from './log'
import type { FlightEntry, FlightsFile } from './types'

const airports = {
  ATL: { iata: 'ATL', name: 'Atlanta', city: 'Atlanta', country: 'US', lat: 33.6367, lng: -84.4281 },
  RDU: { iata: 'RDU', name: 'Raleigh–Durham', city: 'Raleigh', country: 'US', lat: 35.8776, lng: -78.7875 },
  HND: { iata: 'HND', name: 'Haneda', city: 'Tokyo', country: 'JP', lat: 35.5523, lng: 139.78 },
}

const flight = (partial: Partial<FlightEntry>): FlightEntry => ({
  month: '2024-01',
  from: 'ATL',
  to: 'RDU',
  airline: 'DAL',
  aircraft: 'Boeing 737-900ER',
  blockMin: 70,
  arrDelayMin: 0,
  ...partial,
})

const fixture: FlightsFile = {
  version: 1,
  through: '2024-04',
  airports,
  airlines: { DAL: 'Delta Air Lines' },
  flights: [
    flight({ month: '2024-01', arrDelayMin: -10 }),
    flight({ month: '2024-01', from: 'RDU', to: 'ATL', arrDelayMin: 20 }),
    flight({ month: '2024-04', to: 'HND', aircraft: 'Airbus A350-900', blockMin: 820, arrDelayMin: 5 }),
    flight({ month: '2024-04', airline: 'XXX', aircraft: null, blockMin: null, arrDelayMin: null }),
  ],
}

describe('monthRange', () => {
  it('fills every month, across a year boundary', () => {
    expect(monthRange('2024-11', '2025-02')).toEqual(['2024-11', '2024-12', '2025-01', '2025-02'])
  })
})

describe('aircraftFamily', () => {
  it.each([
    ['Airbus A350-900', 'Airbus A350'],
    ['Airbus A321neo', 'Airbus A321'],
    ['Boeing 737-900ER', 'Boeing 737'],
    ['Boeing 737 MAX 8', 'Boeing 737 MAX'],
    ['Bombardier CRJ900 ', 'Bombardier CRJ'],
    ['Embraer 175', 'Embraer E175'],
    ['De Havilland Dash 8', 'De Havilland Dash 8'],
  ])('%s → %s', (input, expected) => {
    expect(aircraftFamily(input)).toBe(expected)
  })
})

describe('buildFlightLog', () => {
  const log = buildFlightLog(fixture)

  it('treats both directions as one route', () => {
    const atlRdu = log.routes.find((r) => r.key === 'ATL-RDU')!
    expect(atlRdu.count).toBe(3)
    expect(log.routes).toHaveLength(2)
    expect(log.records?.topRoute.key).toBe('ATL-RDU')
  })

  it('zero-fills months with no flights', () => {
    expect(log.months.map((m) => [m.month, m.count])).toEqual([
      ['2024-01', 2],
      ['2024-02', 0],
      ['2024-03', 0],
      ['2024-04', 2],
    ])
  })

  it('computes punctuality only from flights with actual times', () => {
    expect(log.punctuality).toMatchObject({ measured: 3, medianMin: 5, worstMin: 20 })
    expect(log.punctuality!.onTimeShare).toBeCloseTo(2 / 3)
    expect(log.punctuality!.earlyShare).toBeCloseTo(1 / 3)
  })

  it('sums distance and block time, skipping unknowns', () => {
    const sumKm = log.flights.reduce((acc, f) => acc + f.km, 0)
    expect(log.totals.km).toBeCloseTo(sumKm, 6)
    expect(log.totals.blockHours).toBeCloseTo((70 + 70 + 820) / 60, 6)
    expect(log.records?.longest.to).toBe('HND')
    expect(log.records?.longestBlock?.blockMin).toBe(820)
  })

  it('counts airports per visit and countries by ISO code', () => {
    expect(log.airports[0]).toMatchObject({ item: { iata: 'ATL' }, count: 4 })
    expect(log.totals.countries).toBe(2)
  })

  it('falls back to the raw code for unknown airlines', () => {
    expect(log.airlines.map((a) => a.item.name)).toContain('XXX')
  })
})

describe('air returns (from === to)', () => {
  const withReturn: FlightsFile = {
    ...fixture,
    flights: [...fixture.flights, flight({ month: '2024-04', from: 'ATL', to: 'ATL', blockMin: 106 })],
  }
  const log = buildFlightLog(withReturn)

  it('counts as a flight but not as a route', () => {
    expect(log.totals.flights).toBe(5)
    expect(log.totals.returnedToOrigin).toBe(1)
    expect(log.routes.map((r) => r.key)).not.toContain('ATL-ATL')
  })

  it('counts its airport once, not twice', () => {
    expect(log.airports.find((a) => a.item.iata === 'ATL')?.count).toBe(5)
    expect(airportDetail(log, 'ATL')?.stats?.visits).toBe(5)
  })

  it('never wins the shortest-hop record', () => {
    expect(log.records?.shortest.km).toBeGreaterThan(0)
    expect(airportDetail(log, 'ATL')?.destinations.map((r) => r.other.iata)).not.toContain('ATL')
  })
})

describe('airportDetail', () => {
  const log = buildFlightLog(fixture)

  it('counts departures, arrivals and visits separately', () => {
    const atl = airportDetail(log, 'ATL')!
    expect(atl.stats).toMatchObject({ visits: 4, departures: 3, arrivals: 1, firstMonth: '2024-01', lastMonth: '2024-04' })
  })

  it('groups routes by the other airport, busiest first, both directions together', () => {
    const atl = airportDetail(log, 'ATL')!
    expect(atl.destinations.map((r) => [r.other.iata, r.count])).toEqual([
      ['RDU', 3],
      ['HND', 1],
    ])
  })

  it('lists airlines, resolving names and keeping unknown codes', () => {
    const names = airportDetail(log, 'ATL')!.stats!.airlines.map((a) => a.name)
    expect(names).toEqual(['Delta Air Lines', 'XXX'])
  })

  it('returns null for an airport with no flights', () => {
    expect(airportDetail(log, 'LAX')).toBeNull()
  })
})
