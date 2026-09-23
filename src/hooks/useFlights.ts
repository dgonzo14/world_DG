import { useEffect, useState } from 'react'
import { buildFlightLog, type FlightLog } from '../flights/log'
import type { FlightsFile } from '../flights/types'

const DATA_URL = `${import.meta.env.BASE_URL}data/flights.json`

export interface FlightsState {
  log: FlightLog
  buildMs: number
}

/** The flight log is optional: if it's missing or malformed the atlas simply hides flight mode. */
export function useFlights(): FlightsState | null {
  const [state, setState] = useState<FlightsState | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch(DATA_URL, { signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<FlightsFile>) : null))
      .then((file) => {
        if (!file || file.version !== 1 || !Array.isArray(file.flights)) return
        const started = performance.now()
        const log = buildFlightLog(file)
        setState({ log, buildMs: performance.now() - started })
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) console.warn('Flight log unavailable:', error)
      })
    return () => controller.abort()
  }, [])

  return state
}
