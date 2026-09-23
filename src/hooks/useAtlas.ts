import { useEffect, useState } from 'react'
import type { GeometryCollection, Topology } from 'topojson-specification'
import { buildAtlas, type Atlas, type Home } from '../geo/atlas'
import { decodeCountries } from '../geo/topology'

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; atlas: Atlas; fetchMs: number }

const DATA_URL = `${import.meta.env.BASE_URL}data/countries.topo.json`

export function useAtlas(visitedCodes: string[], home: Home): State {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    const started = performance.now()

    fetch(DATA_URL, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json() as Promise<Topology<{ countries: GeometryCollection }>>
      })
      .then((topology) => {
        const fetchMs = performance.now() - started
        const atlas = buildAtlas(decodeCountries(topology), visitedCodes, home)
        if (atlas.diagnostics.unmatchedCodes.length > 0) {
          console.warn('Visited codes with no matching polygon:', atlas.diagnostics.unmatchedCodes)
        }
        setState({ status: 'ready', atlas, fetchMs })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
        })
      })

    return () => controller.abort()
  }, [visitedCodes, home])

  return state
}
