import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import CountryCard from './components/CountryCard'
import CountryList from './components/CountryList'
import EnginePanel, { REPO_URL } from './components/EnginePanel'
import FlightsPanel from './components/FlightsPanel'
import StatsPanel from './components/StatsPanel'
import type { CameraTarget, Mode } from './components/GlobeView'
import { HOME } from './data/home'
import visitedCountries from './data/visitedCountries'
import type { Atlas, Country } from './geo/atlas'
import { useAtlas } from './hooks/useAtlas'
import { useElementSize } from './hooks/useElementSize'
import { useFlights } from './hooks/useFlights'
import { useHashSelection } from './hooks/useHashSelection'
import { useReducedMotion } from './hooks/useReducedMotion'
import { formatBuildDate, formatCompact, formatKm, formatMonth, pad2 } from './lib/format'
import { hasWebGL } from './lib/webgl'

// three.js is ~70% of the bundle; load it after the shell has painted.
const GlobeView = lazy(() => import('./components/GlobeView'))

const TOUR_DWELL_MS = 3600
const REPLAY_STEP_MS = 120
const RESET_VIEW: CameraTarget = { lat: 24, lng: -38, altitude: 2.35 }

type Tab = 'countries' | 'flights' | 'stats' | 'engine'
const TABS: { id: Tab; label: string }[] = [
  { id: 'countries', label: 'Countries' },
  { id: 'flights', label: 'Flights' },
  { id: 'stats', label: 'Stats' },
  { id: 'engine', label: 'Under the hood' },
]

const initialView = () => new URLSearchParams(window.location.search).get('view')

function cameraFor(country: Country): CameraTarget {
  // Bigger countries need a higher camera to fit on screen.
  const altitude = Math.min(2.4, Math.max(1.25, 0.9 + Math.sqrt(country.areaKm2) / 2000))
  return { ...country.center, altitude }
}

export default function App() {
  const state = useAtlas(visitedCountries, HOME)
  const atlas = state.status === 'ready' ? state.atlas : null

  return (
    <div className="app">
      <TopBar atlas={atlas} />
      {state.status === 'error' ? (
        <main className="fatal" role="alert">
          <h1>The atlas couldn’t load.</h1>
          <p>Country boundaries failed to download ({state.message}).</p>
          <button type="button" className="btn" onClick={() => window.location.reload()}>
            Try again
          </button>
        </main>
      ) : atlas ? (
        <Explorer atlas={atlas} fetchMs={state.status === 'ready' ? state.fetchMs : 0} />
      ) : (
        <main className="stage stage--loading" aria-busy="true">
          <div className="globe-area">
            <div className="loader" role="status">
              <span className="loader__orb" aria-hidden="true" />
              Loading {visitedCountries.length} countries…
            </div>
          </div>
          <aside className="panel" aria-hidden="true" />
        </main>
      )}
    </div>
  )
}

function TopBar({ atlas }: { atlas: Atlas | null }) {
  return (
    <header className="topbar">
      <div className="brand">
        <img className="brand__avatar" src={`${import.meta.env.BASE_URL}avatar.png`} width={34} height={34} alt="Diego Gonzalez" />
        <span className="brand__name">
          Atlas <small aria-hidden="true">Diego Gonzalez</small>
        </span>
      </div>
      {atlas && (
        <p className="topbar__meta">
          {atlas.totals.visited} countries · {atlas.totals.continentsVisited} continents · updated{' '}
          {formatBuildDate(__BUILD_DATE__)}
        </p>
      )}
      <nav className="topbar__links" aria-label="External">
        <a href={REPO_URL} target="_blank" rel="noreferrer">
          Source ↗
        </a>
      </nav>
    </header>
  )
}

function Explorer({ atlas, fetchMs }: { atlas: Atlas; fetchMs: number }) {
  const [code, setCode] = useHashSelection()
  const flightsState = useFlights()
  const flightLog = flightsState?.log ?? null
  // `?view=flights` opens straight into the flight log (shareable link).
  const [mode, setMode] = useState<Mode>(() => (initialView() === 'flights' ? 'flights' : 'loop'))
  const [tab, setTab] = useState<Tab>(() => (initialView() === 'flights' ? 'flights' : 'countries'))
  const [showArcs, setShowArcs] = useState(true)
  const [tour, setTour] = useState<{ index: number; playing: boolean } | null>(null)
  const [replay, setReplay] = useState<{ index: number; playing: boolean } | null>(null)
  const [resetCount, setResetCount] = useState(0)
  const [webgl] = useState(hasWebGL)
  const [globeRef, globeSize] = useElementSize<HTMLDivElement>()
  const searchRef = useRef<HTMLInputElement>(null)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const reducedMotion = useReducedMotion()

  const selected = code ? atlas.byCode.get(code) ?? null : null
  const stops = atlas.visited
  const inFlights = mode === 'flights' && flightLog !== null
  const tabs = TABS.filter((t) => t.id !== 'flights' || flightLog)

  const camera = useMemo<CameraTarget | null>(() => {
    if (selected) return cameraFor(selected)
    return resetCount > 0 ? { ...RESET_VIEW } : null
  }, [selected, resetCount])

  // Running total of distance, for the replay readout.
  const kmSoFar = useMemo(() => {
    const totals: number[] = []
    for (const f of flightLog?.flights ?? []) totals.push((totals.at(-1) ?? 0) + f.km)
    return totals
  }, [flightLog])

  const select = useCallback(
    (next: string | null, replace = false) => {
      setCode(next, { replace })
    },
    [setCode],
  )

  const step = useCallback(
    (delta: 1 | -1) => {
      const current = selected?.stop ? selected.stop - 1 : delta === 1 ? -1 : 0
      const next = (current + delta + stops.length) % stops.length
      setTour((t) => (t ? { ...t, index: next } : t))
      select(stops[next].code, true)
    },
    [selected, stops, select],
  )

  const switchMode = (next: Mode) => {
    setTour(null)
    setReplay(null)
    setMode(next)
    if (next === 'flights') setTab('flights')
    else if (tab === 'flights') setTab('countries')
  }

  // --- Tour: fly the optimized route one stop at a time -------------------
  const startTour = () => {
    setShowArcs(true)
    setTour({ index: 0, playing: true })
    select(stops[0].code, true)
  }
  const stopTour = useCallback(() => {
    setTour(null)
    select(null, true)
    setResetCount((n) => n + 1)
  }, [select])

  useEffect(() => {
    if (!tour?.playing) return undefined
    const timer = window.setTimeout(() => {
      const next = tour.index + 1
      if (next >= stops.length) {
        stopTour()
        return
      }
      setTour({ index: next, playing: true })
      select(stops[next].code, true)
    }, TOUR_DWELL_MS)
    return () => window.clearTimeout(timer)
  }, [tour, stops, select, stopTour])

  // --- Replay: every flight in order, as comets over the growing network ---
  const startReplay = () => {
    select(null, true)
    setShowArcs(true)
    setTab('flights')
    // Reduced motion: skip the animation and show the finished network.
    setReplay(reducedMotion ? null : { index: 0, playing: true })
  }

  useEffect(() => {
    if (!replay?.playing || !flightLog) return undefined
    const timer = window.setTimeout(() => {
      const next = replay.index + 1
      setReplay(next >= flightLog.flights.length ? null : { index: next, playing: true })
    }, REPLAY_STEP_MS)
    return () => window.clearTimeout(timer)
  }, [replay, flightLog])

  // --- Keyboard shortcuts ----------------------------------------------------
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const target = e.target instanceof Element ? e.target : null
      if (target?.closest('input, select, textarea') || e.metaKey || e.ctrlKey || e.altKey) {
        if (e.key === 'Escape' && target === searchRef.current) searchRef.current?.blur()
        return
      }
      const key = e.key.toLowerCase()
      if (e.key === '/') {
        e.preventDefault()
        setTab('countries')
        requestAnimationFrame(() => searchRef.current?.focus())
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        step(1)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        step(-1)
      } else if (e.key === 'Escape') {
        if (tour) stopTour()
        else if (replay) setReplay(null)
        else select(null)
      } else if (key === 'f' && flightLog) {
        switchMode(mode === 'flights' ? 'loop' : 'flights')
      } else if (key === 't') {
        if (inFlights) {
          if (replay) setReplay({ ...replay, playing: !replay.playing })
          else startReplay()
        } else if (tour) setTour({ ...tour, playing: !tour.playing })
        else startTour()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    e.stopPropagation()
    const next = (index + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
    setTab(tabs[next].id)
    tabRefs.current[next]?.focus()
  }

  const activeLeg = inFlights ? null : tour ? tour.index : selected?.stop ? selected.stop - 1 : null
  const replayFlight = replay && flightLog ? flightLog.flights[replay.index] : null

  return (
    <main className="stage">
      <section className="globe-area" aria-label="Interactive globe">
        <div className="globe-canvas" ref={globeRef}>
          {webgl ? (
            globeSize.width > 0 && (
              <Suspense fallback={<div className="loader"><span className="loader__orb" aria-hidden="true" />Loading 3D globe…</div>}>
                <GlobeView
                  atlas={atlas}
                  flightLog={flightLog}
                  mode={inFlights ? 'flights' : 'loop'}
                  width={globeSize.width}
                  height={globeSize.height}
                  selected={selected}
                  activeLeg={activeLeg}
                  replayIndex={replay?.index ?? null}
                  showArcs={showArcs}
                  autoRotate={!selected && !tour}
                  reducedMotion={reducedMotion}
                  camera={camera}
                  onSelect={(next) => select(next)}
                />
              </Suspense>
            )
          ) : (
            <div className="loader">
              The 3D globe needs WebGL, which this browser has turned off. Everything else still works from the list.
            </div>
          )}
        </div>

        <div className={`hud hud--title ${tour || replay || selected ? 'is-dim' : ''}`}>
          {inFlights ? (
            <>
              <p className="eyebrow">
                Flight log · {formatMonth(flightLog.first)} – {formatMonth(flightLog.through)}
              </p>
              <h1>
                {flightLog.totals.flights} flights.
                <br />
                {formatCompact(flightLog.totals.km)} km.
              </h1>
              <p className="hud__sub">
                {flightLog.totals.laps.toFixed(1)}× around the equator through {flightLog.totals.airports} airports,
                imported from my Flighty history.
              </p>
            </>
          ) : (
            <>
              <p className="eyebrow">Travel atlas · {pad2(atlas.totals.visited)} stamps</p>
              <h1>
                {atlas.totals.visited} countries.
                <br />
                One round trip.
              </h1>
              <p className="hud__sub">
                {formatKm(atlas.route.totalKm)} from {atlas.home.name} and back, planned by a 2-opt route optimizer.
              </p>
            </>
          )}
        </div>

        {tour ? (
          <div className="hud hud--tour" role="group" aria-label="Route tour">
            <div className="tour__progress" aria-hidden="true">
              <span style={{ width: `${((tour.index + 1) / stops.length) * 100}%` }} />
            </div>
            <p className="tour__now">
              <span>
                Stop {pad2(tour.index + 1)} / {pad2(stops.length)}
              </span>
              <b>{stops[tour.index].name}</b>
              <small>+{formatKm(atlas.route.legs[tour.index].km)}</small>
            </p>
            <div className="tour__buttons">
              <button type="button" className="icon-btn" onClick={() => step(-1)} aria-label="Previous stop">
                ‹
              </button>
              <button
                type="button"
                className="btn btn--signal"
                onClick={() => setTour({ ...tour, playing: !tour.playing })}
              >
                {tour.playing ? 'Pause' : 'Resume'}
              </button>
              <button type="button" className="icon-btn" onClick={() => step(1)} aria-label="Next stop">
                ›
              </button>
              <button type="button" className="btn btn--ghost" onClick={stopTour}>
                End tour
              </button>
            </div>
          </div>
        ) : replay && flightLog && replayFlight ? (
          <div className="hud hud--tour" role="group" aria-label="Flight replay">
            <div className="tour__progress" aria-hidden="true">
              <span style={{ width: `${((replay.index + 1) / flightLog.flights.length) * 100}%` }} />
            </div>
            <p className="tour__now">
              <span>{formatMonth(replayFlight.month)}</span>
              <b>
                {replayFlight.from} → {replayFlight.to}
              </b>
              <small>
                #{replay.index + 1} · {formatCompact(kmSoFar[replay.index])} km
              </small>
            </p>
            <div className="tour__buttons">
              <button
                type="button"
                className="btn btn--signal"
                onClick={() => setReplay({ ...replay, playing: !replay.playing })}
              >
                {replay.playing ? 'Pause' : 'Resume'}
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setReplay(null)}>
                Skip to end
              </button>
            </div>
          </div>
        ) : (
          <div className="hud hud--controls">
            {flightLog && (
              <div className="segmented" role="group" aria-label="Globe mode">
                <button type="button" aria-pressed={!inFlights} onClick={() => switchMode('loop')}>
                  Loop
                </button>
                <button type="button" aria-pressed={inFlights} onClick={() => switchMode('flights')}>
                  Flights <kbd>F</kbd>
                </button>
              </div>
            )}
            {inFlights ? (
              <button type="button" className="btn btn--signal" onClick={startReplay}>
                ▶ Replay {flightLog.months.length} months <kbd>T</kbd>
              </button>
            ) : (
              <button type="button" className="btn btn--signal" onClick={startTour}>
                ▶ Fly the route <kbd>T</kbd>
              </button>
            )}
            <button type="button" className="btn btn--ghost" aria-pressed={showArcs} onClick={() => setShowArcs((v) => !v)}>
              {showArcs ? 'Hide' : 'Show'} arcs
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                select(null)
                setResetCount((n) => n + 1)
              }}
            >
              Reset view
            </button>
          </div>
        )}

        <ul className="hud hud--legend" aria-label="Legend">
          {inFlights ? (
            <>
              <li><span className="swatch swatch--flown" />Flown route</li>
              <li><span className="swatch swatch--airport" />Airport</li>
              <li><span className="swatch swatch--visited-dim" />Visited country</li>
            </>
          ) : (
            <>
              <li><span className="swatch swatch--visited" />Visited</li>
              <li><span className="swatch swatch--land" />Not yet</li>
              <li><span className="swatch swatch--route" />Route</li>
              <li><span className="swatch swatch--home" />{atlas.home.code}</li>
            </>
          )}
        </ul>
      </section>

      <aside className="panel" aria-label="Atlas details">
        {selected && (
          <CountryCard
            atlas={atlas}
            country={selected}
            flightLog={flightLog}
            onPrev={() => step(-1)}
            onNext={() => step(1)}
            onClose={() => (tour ? stopTour() : select(null))}
          />
        )}

        <div className="tabs" role="tablist" aria-label="Atlas views">
          {tabs.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[i] = el
              }}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              className="tab"
              onClick={() => setTab(t.id)}
              onKeyDown={(e) => onTabKey(e, i)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="tabpanel" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {tab === 'countries' && (
            <CountryList atlas={atlas} selectedCode={code} onSelect={(c) => select(c)} searchRef={searchRef} />
          )}
          {tab === 'flights' && flightLog && (
            <FlightsPanel log={flightLog} replayMonth={replayFlight?.month ?? null} />
          )}
          {tab === 'stats' && <StatsPanel atlas={atlas} onSelect={(c) => select(c)} />}
          {tab === 'engine' && <EnginePanel atlas={atlas} fetchMs={fetchMs} flights={flightsState} />}
        </div>
      </aside>
    </main>
  )
}
