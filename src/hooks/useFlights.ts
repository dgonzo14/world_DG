import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildFlightLog, type FlightLog } from '../flights/log'
import { buildNetwork, networkFromLog, type FlightNetwork } from '../flights/network'
import type { FlightsFile, PublicFlightsFile } from '../flights/types'
import { unseal, type Vault } from '../flights/vault'

const PUBLIC_URL = `${import.meta.env.BASE_URL}data/flights.public.json`
const VAULT_URL = `${import.meta.env.BASE_URL}data/flights.vault.json`

export interface FlightsState {
  /** Airports and unique routes: always available. */
  network: FlightNetwork
  /** The detailed log: only after unlocking, and only in memory. */
  log: FlightLog | null
  buildMs: number
  /** Throws WrongCodeError on a bad code. */
  unlock: (code: string) => Promise<void>
  /** Drops the decrypted log from memory. */
  lock: () => void
}

/**
 * Loads the public route network immediately. The encrypted log is fetched
 * only when someone tries to unlock it, decrypted locally, and never stored.
 * If the public file is missing, flight mode simply hides.
 */
export function useFlights(): FlightsState | null {
  const [publicNetwork, setPublicNetwork] = useState<FlightNetwork | null>(null)
  const [log, setLog] = useState<FlightLog | null>(null)
  const [buildMs, setBuildMs] = useState(0)
  const vault = useRef<Promise<Vault> | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch(PUBLIC_URL, { signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<PublicFlightsFile>) : null))
      .then((file) => {
        if (!file || file.version !== 1 || !Array.isArray(file.routes)) return
        const started = performance.now()
        const built = buildNetwork(file)
        setBuildMs(performance.now() - started)
        setPublicNetwork(built)
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) console.warn('Flight network unavailable:', error)
      })
    return () => controller.abort()
  }, [])

  const unlock = useCallback(async (code: string) => {
    vault.current ??= fetch(VAULT_URL).then((response) => {
      if (!response.ok) throw new Error('The detailed flight log is not published.')
      return response.json() as Promise<Vault>
    })
    const started = performance.now()
    let file: FlightsFile
    try {
      file = JSON.parse(await unseal(await vault.current, code)) as FlightsFile
    } catch (error) {
      // Let a failed fetch be retried on the next attempt.
      if (!(error instanceof Error && error.name === 'WrongCodeError')) vault.current = null
      throw error
    }
    const built = buildFlightLog(file)
    setBuildMs(performance.now() - started)
    setLog(built)
  }, [])

  const lock = useCallback(() => setLog(null), [])

  // When unlocked, derive the network from the log so both views agree exactly.
  // Memoized: the globe diffs its layers by object identity.
  const unlockedNetwork = useMemo(() => (log ? networkFromLog(log) : null), [log])
  const network = unlockedNetwork ?? publicNetwork
  if (!network) return null
  return { network, log, buildMs, unlock, lock }
}
