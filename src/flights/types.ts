/**
 * Shape of public/data/flights.json, produced by scripts/import-flighty.ts.
 *
 * Deliberately coarse: month-level dates, no flight numbers, gates, seats or
 * booking data, and nothing scheduled after the export date.
 */
export interface FlightsFile {
  version: 1
  /** Last month that contains a flight (YYYY-MM). */
  through: string
  airports: Record<string, AirportRef>
  airlines: Record<string, string>
  /** Chronological. */
  flights: FlightEntry[]
}

export interface AirportRef {
  iata: string
  name: string
  city: string
  /** ISO 3166-1 alpha-2, for joining to Natural Earth countries. */
  country: string
  lat: number
  lng: number
}

export interface FlightEntry {
  /** YYYY-MM */
  month: string
  from: string
  to: string
  /** ICAO airline designator, e.g. DAL. */
  airline: string
  aircraft: string | null
  /** Gate-to-gate minutes, computed in UTC. */
  blockMin: number | null
  /** Actual minus scheduled gate arrival; negative is early. */
  arrDelayMin: number | null
}

/**
 * public/data/flights.public.json: where I've flown, not how often or when.
 * Routes are unique airport pairs in alphabetical order, so even their order
 * carries no frequency information. The detailed log is encrypted separately.
 */
export interface PublicFlightsFile {
  version: 1
  airports: Record<string, AirportRef>
  routes: [string, string][]
}
