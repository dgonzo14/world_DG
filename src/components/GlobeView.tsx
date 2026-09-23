import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Globe, { type GlobeMethods } from 'react-globe.gl'
import { Color, MeshPhongMaterial } from 'three'
import type { FlightLog } from '../flights/log'
import type { FlightNetwork } from '../flights/network'
import type { Atlas, Country } from '../geo/atlas'
import type { LatLng } from '../geo/sphere'
import { escapeHtml, formatKm, pad2 } from '../lib/format'

export interface CameraTarget extends LatLng {
  altitude: number
}

export type Mode = 'loop' | 'flights'

interface Props {
  atlas: Atlas
  /** Public route network (airports + unique routes, no frequency). */
  network: FlightNetwork | null
  /** Detailed log, present only when unlocked: adds counts, sizes and replay. */
  flightLog: FlightLog | null
  mode: Mode
  width: number
  height: number
  selected: Country | null
  /** Flights mode: selected airport (IATA). */
  selectedAirport: string | null
  /** Loop mode: route leg to emphasise (0 = home → first stop). */
  activeLeg: number | null
  /** Flights mode: index of the flight currently being replayed. */
  replayIndex: number | null
  showArcs: boolean
  autoRotate: boolean
  reducedMotion: boolean
  camera: CameraTarget | null
  onSelect: (code: string | null) => void
  onSelectAirport: (iata: string) => void
}

interface ArcBase {
  startLat: number
  startLng: number
  endLat: number
  endLng: number
}

interface LoopArc extends ArcBase {
  kind: 'loop'
  index: number
  km: number
  label: string
}

interface RouteArc extends ArcBase {
  kind: 'route'
  key: string
  label: string
  km: number
  /** Chronological indices of the flights on this route, both directions. */
  flights: number[]
}

interface CometArc extends ArcBase {
  kind: 'comet'
  index: number
}

type Arc = LoopArc | RouteArc | CometArc

interface AirportPoint extends LatLng {
  iata: string
  name: string
  city: string
  /** Distinct destinations (public). */
  degree: number
  /** Chronological flight indices; empty when the log is locked. */
  firstFlight: number
  flights: number[]
}

interface Marker extends LatLng {
  kind: 'home' | 'selected' | 'arrival' | 'airport'
  text: string
}

const COLORS = {
  visited: '#ffc425',
  visitedHover: '#ffd766',
  visitedDim: '#6b5518',
  selected: '#fff3c4',
  land: '#2d323a',
  landDim: '#232830',
  landHover: '#454b55',
  landSelected: '#6b7280',
  visitedSide: 'rgba(255, 196, 37, 0.32)',
  landSide: 'rgba(45, 50, 58, 0.55)',
  stroke: 'rgba(241, 235, 222, 0.13)',
  arcFrom: 'rgba(212, 67, 44, 0.85)',
  arcTo: 'rgba(255, 196, 37, 0.95)',
  arcDim: 'rgba(241, 235, 222, 0.16)',
  arcActive: '#fff3c4',
  airport: '#f1ebde',
}

const INITIAL_VIEW: CameraTarget = { lat: 24, lng: -38, altitude: 2.35 }

const globeMaterial = new MeshPhongMaterial({
  color: new Color('#101722'),
  emissive: new Color('#060a10'),
  emissiveIntensity: 1,
  shininess: 6,
})

/** How many of `sorted` are ≤ limit (binary search: this runs per arc on every replay tick). */
function countUpTo(sorted: number[], limit: number) {
  let lo = 0
  let hi = sorted.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sorted[mid] <= limit) lo = mid + 1
    else hi = mid
  }
  return lo
}

function tooltip(country: Country) {
  const status = country.visited
    ? `<span class="tip__status tip__status--visited">Stop ${pad2(country.stop ?? 0)} · visited</span>`
    : `<span class="tip__status">Not yet</span>`
  return `<div class="tip">
    <span class="tip__code">${country.code}</span>
    <span class="tip__name">${escapeHtml(country.name)}</span>
    ${status}
  </div>`
}

export default function GlobeView({
  atlas,
  network,
  flightLog,
  mode,
  width,
  height,
  selected,
  selectedAirport,
  activeLeg,
  replayIndex,
  showArcs,
  autoRotate,
  reducedMotion,
  camera,
  onSelect,
  onSelectAirport,
}: Props) {
  const globeRef = useRef<GlobeMethods | undefined>(undefined)
  const [ready, setReady] = useState(false)
  const [hovered, setHovered] = useState<Country | null>(null)
  const flights = mode === 'flights' && network ? network : null
  const log = flights ? flightLog : null
  const replaying = log !== null && replayIndex !== null
  const limit = replaying ? replayIndex : Infinity

  // --- Static datasets (stable object identity so the globe diffs cheaply) ---
  const loopArcs = useMemo<LoopArc[]>(() => {
    const sequence = [
      { ...atlas.home, name: atlas.home.name },
      ...atlas.visited.map((c) => ({ ...c.center, name: c.name })),
      { ...atlas.home, name: atlas.home.name },
    ]
    return atlas.route.legs.map((leg, index) => ({
      kind: 'loop',
      index,
      startLat: sequence[index].lat,
      startLng: sequence[index].lng,
      endLat: sequence[index + 1].lat,
      endLng: sequence[index + 1].lng,
      km: leg.km,
      label: `${sequence[index].name} → ${sequence[index + 1].name}`,
    }))
  }, [atlas])

  // Flight indices per route and per airport, from the unlocked log only.
  const flightsByRoute = useMemo(() => {
    const byKey = new Map<string, number[]>()
    for (const f of flightLog?.flights ?? []) {
      if (f.from === f.to) continue
      const key = [f.from, f.to].sort().join('-')
      if (!byKey.has(key)) byKey.set(key, [])
      byKey.get(key)!.push(f.index)
    }
    return byKey
  }, [flightLog])

  const routeArcs = useMemo<RouteArc[]>(
    () =>
      (network?.routes ?? []).map((r) => ({
        kind: 'route',
        key: r.key,
        startLat: r.a.lat,
        startLng: r.a.lng,
        endLat: r.b.lat,
        endLng: r.b.lng,
        km: r.km,
        label: `${r.a.iata} ⇄ ${r.b.iata}`,
        flights: flightsByRoute.get(r.key) ?? [],
      })),
    [network, flightsByRoute],
  )

  const cometArcs = useMemo<CometArc[]>(
    () =>
      (flightLog?.flights ?? []).map((f) => ({
        kind: 'comet',
        index: f.index,
        startLat: f.origin.lat,
        startLng: f.origin.lng,
        endLat: f.destination.lat,
        endLng: f.destination.lng,
      })),
    [flightLog],
  )

  const airportPoints = useMemo<AirportPoint[]>(() => {
    if (!network) return []
    const byCode = new Map<string, number[]>()
    for (const f of flightLog?.flights ?? []) {
      // An air return (from === to) is one visit, not two.
      for (const iata of f.from === f.to ? [f.from] : [f.from, f.to]) {
        if (!byCode.has(iata)) byCode.set(iata, [])
        byCode.get(iata)!.push(f.index)
      }
    }
    return network.airports.map((ap) => {
      const indices = byCode.get(ap.iata) ?? []
      return {
        iata: ap.iata,
        name: ap.name,
        city: ap.city,
        lat: ap.lat,
        lng: ap.lng,
        degree: network.degree.get(ap.iata) ?? 0,
        firstFlight: indices[0] ?? 0,
        flights: indices,
      }
    })
  }, [network, flightLog])

  // --- What's visible right now -----------------------------------------------
  const arcs = useMemo<Arc[]>(() => {
    if (!showArcs) return []
    if (!flights) return loopArcs
    const visibleRoutes = replaying ? routeArcs.filter((r) => r.flights[0] <= limit) : routeArcs
    // The last few flights of the replay fly as comets over the accumulated routes.
    const comets = replaying ? cometArcs.slice(Math.max(0, limit - 2), limit + 1) : []
    return [...visibleRoutes, ...comets]
  }, [showArcs, flights, loopArcs, routeArcs, cometArcs, replaying, limit])

  const points = useMemo(
    () => (flights ? (replaying ? airportPoints.filter((p) => p.firstFlight <= limit) : airportPoints) : []),
    [flights, replaying, airportPoints, limit],
  )

  // Resting labels for the busiest few only; the rest reveal on hover, which keeps
  // the dense US cluster readable.
  const topAirports = useMemo(() => {
    // Busiest by visits when unlocked; most connected (a public fact) otherwise.
    const ranked = flightLog ? flightLog.airports.map((a) => a.item.iata) : (network?.airports ?? []).map((a) => a.iata)
    return new Set(ranked.slice(0, 6))
  }, [flightLog, network])

  // Airports one hop from the selected airport.
  const connected = useMemo(() => {
    const set = new Set<string>()
    if (!network || !selectedAirport) return set
    for (const r of network.routes) {
      if (r.a.iata === selectedAirport) set.add(r.b.iata)
      if (r.b.iata === selectedAirport) set.add(r.a.iata)
    }
    return set
  }, [network, selectedAirport])

  const markers = useMemo<Marker[]>(() => {
    const list: Marker[] = []
    if (!flights) list.push({ ...atlas.home, kind: 'home', text: atlas.home.code })
    if (selected) list.push({ ...selected.center, kind: 'selected', text: selected.code })
    if (replaying) {
      const f = log.flights[limit]
      if (f) list.push({ lat: f.destination.lat, lng: f.destination.lng, kind: 'arrival', text: f.to })
    }
    const airport = flights && selectedAirport ? airportPoints.find((p) => p.iata === selectedAirport) : null
    if (airport) list.push({ lat: airport.lat, lng: airport.lng, kind: 'airport', text: airport.iata })
    return list
  }, [atlas.home, selected, flights, log, replaying, limit, selectedAirport, airportPoints])

  // Airports carry their own HTML labels, so the text layer is only for home.
  const labels = useMemo(() => (flights ? [] : markers.filter((m) => m.kind === 'home')), [flights, markers])

  // --- Airport markers -----------------------------------------------------------
  // react-globe.gl positions these DOM nodes for us. They're created once per
  // airport and then updated in place, so a replay tick doesn't rebuild 64 elements.
  const elements = useRef(new Map<string, HTMLButtonElement>())
  const onSelectAirportRef = useRef(onSelectAirport)
  const applyRef = useRef<(el: HTMLButtonElement, p: AirportPoint) => void>(() => {})

  useEffect(() => {
    onSelectAirportRef.current = onSelectAirport
    applyRef.current = (el, p) => {
      // Unlocked: size and label by visits. Public: by distinct destinations only.
      const n = log ? countUpTo(p.flights, limit) : null
      const isSelected = p.iata === selectedAirport
      const isConnected = connected.has(p.iata)
      const size = n !== null ? 5 + 1.5 * Math.sqrt(n) : 5 + 1.1 * Math.sqrt(p.degree)
      const detail =
        n !== null ? `${n} ${n === 1 ? 'visit' : 'visits'}` : `${p.degree} ${p.degree === 1 ? 'route' : 'routes'}`
      el.style.setProperty('--size', `${Math.min(18, size).toFixed(1)}px`)
      el.classList.toggle('is-selected', isSelected)
      el.classList.toggle('is-connected', isConnected)
      el.classList.toggle('is-dim', Boolean(selectedAirport) && !isSelected && !isConnected)
      el.classList.toggle('is-top', topAirports.has(p.iata))
      el.querySelector('.ap__count')!.textContent = detail
      el.setAttribute('aria-label', `${p.iata}, ${p.name}, ${p.city}: ${detail}`)
      el.setAttribute('aria-pressed', String(isSelected))
    }
    for (const p of airportPoints) {
      const el = elements.current.get(p.iata)
      if (el) applyRef.current(el, p)
    }
  }, [onSelectAirport, log, limit, selectedAirport, connected, topAirports, airportPoints])

  const airportElement = useCallback((obj: object) => {
    const p = obj as AirportPoint
    let el = elements.current.get(p.iata)
    if (!el) {
      el = document.createElement('button')
      el.type = 'button'
      el.className = 'ap'
      // The globe is pointer-only; the Flights tab lists every airport for keyboard users.
      el.tabIndex = -1
      // Two separate labels so their visibility rules can't fight: a small code tag
      // for busy/connected airports, and a full tooltip on hover.
      el.innerHTML =
        `<span class="ap__dot"></span>` +
        `<span class="ap__tag">${p.iata}</span>` +
        `<span class="ap__tip"><b>${p.iata} · ${escapeHtml(p.city)}</b>` +
        `<span class="ap__name">${escapeHtml(p.name)}</span><span class="ap__count"></span></span>`
      el.addEventListener('click', (event) => {
        event.stopPropagation()
        onSelectAirportRef.current(p.iata)
      })
      // Don't let the globe raycast "through" the marker and hover the country below.
      el.addEventListener('pointermove', (event) => event.stopPropagation())
      elements.current.set(p.iata, el)
    }
    applyRef.current(el, p)
    return el
  }, [])

  // --- Camera & controls -------------------------------------------------------
  useEffect(() => {
    const globe = globeRef.current
    if (!ready || !globe) return
    const controls = globe.controls()
    controls.enableDamping = true
    controls.dampingFactor = 0.06
    controls.enablePan = false
    controls.minDistance = 130
    controls.maxDistance = 460
    controls.autoRotateSpeed = 0.35
    globe.pointOfView(INITIAL_VIEW, 0)
  }, [ready])

  useEffect(() => {
    const globe = globeRef.current
    if (!ready || !globe) return
    const controls = globe.controls()
    controls.autoRotate = autoRotate && !reducedMotion
    controls.autoRotateSpeed = replaying ? 0.9 : 0.35
  }, [ready, autoRotate, reducedMotion, replaying])

  useEffect(() => {
    const globe = globeRef.current
    if (!ready || !globe || !camera) return
    globe.pointOfView(camera, reducedMotion ? 0 : 1400)
  }, [ready, camera, reducedMotion])

  // --- Accessors ---------------------------------------------------------------
  const asCountry = (obj: object) => obj as Country
  // react-globe.gl types coordinates as number[]; our Geometry type is more precise.
  const geometryOf = (obj: object) =>
    asCountry(obj).feature.geometry as unknown as { type: string; coordinates: number[] }
  const asArc = (obj: object) => obj as Arc
  const asMarker = (obj: object) => obj as Marker
  const asPoint = (obj: object) => obj as AirportPoint

  const capColor = useCallback(
    (obj: object) => {
      const c = asCountry(obj)
      if (c === selected) return c.visited ? COLORS.selected : COLORS.landSelected
      if (c === hovered) return c.visited ? COLORS.visitedHover : COLORS.landHover
      // In flight mode countries step back so the arcs carry the picture.
      if (flights) return c.visited ? COLORS.visitedDim : COLORS.landDim
      return c.visited ? COLORS.visited : COLORS.land
    },
    [selected, hovered, flights],
  )

  const altitude = useCallback(
    (obj: object) => {
      const c = asCountry(obj)
      if (c === selected) return 0.045
      if (c === hovered) return c.visited ? 0.022 : 0.012
      return c.visited ? 0.012 : 0.004
    },
    [selected, hovered],
  )

  /** Flights on a route so far, or null when the log is locked (public view has no counts). */
  const routeCount = useCallback((arc: RouteArc) => (log ? countUpTo(arc.flights, limit) : null), [log, limit])
  const touches = useCallback(
    (arc: RouteArc) => Boolean(selectedAirport) && arc.key.split('-').includes(selectedAirport!),
    [selectedAirport],
  )

  const arcColor = useCallback(
    (obj: object) => {
      const arc = asArc(obj)
      if (arc.kind === 'comet') return ['rgba(255, 243, 196, 0)', COLORS.arcActive]
      if (arc.kind === 'route') {
        if (selectedAirport) return touches(arc) ? COLORS.arcActive : 'rgba(255, 196, 37, 0.07)'
        const n = routeCount(arc)
        if (n === null) return 'rgba(255, 196, 37, 0.6)'
        const alpha = 0.35 + 0.55 * Math.min(1, n / 12)
        return `rgba(255, 196, 37, ${alpha.toFixed(2)})`
      }
      if (activeLeg === null) return [COLORS.arcFrom, COLORS.arcTo]
      return arc.index === activeLeg ? [COLORS.arcActive, COLORS.arcActive] : [COLORS.arcDim, COLORS.arcDim]
    },
    [activeLeg, routeCount, selectedAirport, touches],
  )

  const arcStroke = useCallback(
    (obj: object) => {
      const arc = asArc(obj)
      if (arc.kind === 'comet') return 0.9
      if (arc.kind === 'route') {
        const n = routeCount(arc)
        const base = n === null ? 0.32 : 0.18 + 0.16 * Math.sqrt(n)
        return selectedAirport && touches(arc) ? base + 0.35 : base
      }
      return arc.index === activeLeg ? 1.1 : 0.6
    },
    [activeLeg, routeCount, selectedAirport, touches],
  )

  const arcLabel = useCallback(
    (obj: object) => {
      const arc = asArc(obj)
      if (arc.kind === 'comet') return ''
      if (arc.kind === 'route') {
        const n = routeCount(arc)
        const title = n === null ? escapeHtml(arc.label) : `${n} ${n === 1 ? 'flight' : 'flights'}`
        const code = n === null ? 'Route' : escapeHtml(arc.label)
        return `<div class="tip"><span class="tip__code">${code}</span><span class="tip__name">${title}</span><span class="tip__status">${formatKm(arc.km)} each way</span></div>`
      }
      return `<div class="tip"><span class="tip__code">Leg ${pad2(arc.index + 1)}</span><span class="tip__name">${escapeHtml(arc.label)}</span><span class="tip__status">${formatKm(arc.km)}</span></div>`
    },
    [routeCount],
  )

  const loopMotion = reducedMotion ? 0 : 3200

  return (
    <Globe
      ref={globeRef}
      width={width}
      height={height}
      backgroundColor="rgba(0,0,0,0)"
      // Nudge the globe right on wide screens so it clears the title block.
      globeOffset={width > 900 ? [Math.round(width * 0.09), 24] : [0, 30]}
      globeMaterial={globeMaterial}
      showAtmosphere
      atmosphereColor="#a9c4e8"
      atmosphereAltitude={0.13}
      animateIn={!reducedMotion}
      onGlobeReady={() => setReady(true)}
      onGlobeClick={() => onSelect(null)}
      // Countries
      polygonsData={atlas.countries}
      polygonGeoJsonGeometry={geometryOf}
      polygonCapColor={capColor}
      polygonSideColor={(obj: object) => (asCountry(obj).visited ? COLORS.visitedSide : COLORS.landSide)}
      polygonStrokeColor={() => COLORS.stroke}
      polygonAltitude={altitude}
      polygonCapCurvatureResolution={3}
      polygonsTransitionDuration={reducedMotion ? 0 : 280}
      polygonLabel={(obj: object) => tooltip(asCountry(obj))}
      onPolygonHover={(obj: object | null) => setHovered(obj ? asCountry(obj) : null)}
      onPolygonClick={(obj: object) => onSelect(asCountry(obj).code)}
      // Arcs: optimized loop, flown routes, and replay comets
      arcsData={arcs}
      arcColor={arcColor}
      arcStroke={arcStroke}
      arcAltitudeAutoScale={(obj: object) => (asArc(obj).kind === 'loop' ? 0.38 : 0.3)}
      arcDashLength={(obj: object) => ({ loop: 0.45, route: 1, comet: 0.5 })[asArc(obj).kind]}
      arcDashGap={(obj: object) => ({ loop: 0.18, route: 0, comet: 2 })[asArc(obj).kind]}
      arcDashInitialGap={(obj: object) => {
        const arc = asArc(obj)
        return arc.kind === 'loop' ? (arc.index % 5) * 0.12 : arc.kind === 'comet' ? 1 : 0
      }}
      arcDashAnimateTime={(obj: object) => ({ loop: loopMotion, route: 0, comet: reducedMotion ? 0 : 1100 })[asArc(obj).kind]}
      arcsTransitionDuration={0}
      arcLabel={arcLabel}
      // Airports (clickable HTML markers)
      htmlElementsData={points}
      htmlLat={(obj: object) => asPoint(obj).lat}
      htmlLng={(obj: object) => asPoint(obj).lng}
      htmlAltitude={0.008}
      htmlElement={airportElement}
      htmlElementVisibilityModifier={(el: HTMLElement, visible: boolean) => el.classList.toggle('is-behind', !visible)}
      htmlTransitionDuration={0}
      // Pulses
      ringsData={markers}
      ringLat={(obj: object) => asMarker(obj).lat}
      ringLng={(obj: object) => asMarker(obj).lng}
      ringColor={(obj: object) =>
        asMarker(obj).kind === 'home'
          ? (t: number) => `rgba(212, 67, 44, ${1 - t})`
          : (t: number) => `rgba(255, 243, 196, ${1 - t})`
      }
      ringMaxRadius={(obj: object) => ({ home: 3.2, selected: 4.5, arrival: 2.4, airport: 3 })[asMarker(obj).kind]}
      ringPropagationSpeed={2.2}
      ringRepeatPeriod={reducedMotion ? 0 : 1300}
      // Labels: home in loop mode, busiest airports in flights mode
      labelsData={labels}
      labelLat={(obj: object) => (obj as LatLng).lat}
      labelLng={(obj: object) => (obj as LatLng).lng}
      labelText={(obj: object) => (obj as { text: string }).text}
      labelColor={() => COLORS.selected}
      labelSize={flights ? 0.75 : 1.05}
      labelDotRadius={flights ? 0 : 0.45}
      labelAltitude={0.014}
      labelResolution={3}
    />
  )
}
