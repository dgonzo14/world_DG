import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Globe, { type GlobeMethods } from 'react-globe.gl'
import { Color, MeshPhongMaterial } from 'three'
import type { FlightLog } from '../flights/log'
import type { Atlas, Country } from '../geo/atlas'
import type { LatLng } from '../geo/sphere'
import { escapeHtml, formatKm, pad2 } from '../lib/format'

export interface CameraTarget extends LatLng {
  altitude: number
}

export type Mode = 'loop' | 'flights'

interface Props {
  atlas: Atlas
  flightLog: FlightLog | null
  mode: Mode
  width: number
  height: number
  selected: Country | null
  /** Loop mode: route leg to emphasise (0 = home → first stop). */
  activeLeg: number | null
  /** Flights mode: index of the flight currently being replayed. */
  replayIndex: number | null
  showArcs: boolean
  autoRotate: boolean
  reducedMotion: boolean
  camera: CameraTarget | null
  onSelect: (code: string | null) => void
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
  city: string
  firstFlight: number
  flights: number[]
}

interface Marker extends LatLng {
  kind: 'home' | 'selected' | 'arrival'
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
  flightLog,
  mode,
  width,
  height,
  selected,
  activeLeg,
  replayIndex,
  showArcs,
  autoRotate,
  reducedMotion,
  camera,
  onSelect,
}: Props) {
  const globeRef = useRef<GlobeMethods | undefined>(undefined)
  const [ready, setReady] = useState(false)
  const [hovered, setHovered] = useState<Country | null>(null)
  const flights = mode === 'flights' && flightLog ? flightLog : null
  const replaying = flights !== null && replayIndex !== null
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

  const routeArcs = useMemo<RouteArc[]>(() => {
    if (!flightLog) return []
    const byKey = new Map<string, number[]>()
    for (const f of flightLog.flights) {
      const key = [f.from, f.to].sort().join('-')
      if (!byKey.has(key)) byKey.set(key, [])
      byKey.get(key)!.push(f.index)
    }
    return flightLog.routes.map((r) => ({
      kind: 'route',
      key: r.key,
      startLat: r.a.lat,
      startLng: r.a.lng,
      endLat: r.b.lat,
      endLng: r.b.lng,
      km: r.km,
      label: `${r.a.iata} ⇄ ${r.b.iata}`,
      flights: byKey.get(r.key) ?? [],
    }))
  }, [flightLog])

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
    if (!flightLog) return []
    const byCode = new Map<string, AirportPoint>()
    for (const f of flightLog.flights) {
      for (const ap of [f.origin, f.destination]) {
        let point = byCode.get(ap.iata)
        if (!point) {
          point = { iata: ap.iata, city: ap.city, lat: ap.lat, lng: ap.lng, firstFlight: f.index, flights: [] }
          byCode.set(ap.iata, point)
        }
        point.flights.push(f.index)
      }
    }
    return [...byCode.values()]
  }, [flightLog])

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

  const topAirports = useMemo(
    () => (flightLog ? new Set(flightLog.airports.slice(0, 10).map((a) => a.item.iata)) : new Set<string>()),
    [flightLog],
  )

  const markers = useMemo<Marker[]>(() => {
    const list: Marker[] = []
    if (!flights) list.push({ ...atlas.home, kind: 'home', text: atlas.home.code })
    if (selected) list.push({ ...selected.center, kind: 'selected', text: selected.code })
    if (replaying) {
      const f = flights.flights[limit]
      if (f) list.push({ lat: f.destination.lat, lng: f.destination.lng, kind: 'arrival', text: f.to })
    }
    return list
  }, [atlas.home, selected, flights, replaying, limit])

  const labels = useMemo(() => {
    if (!flights) return markers.filter((m) => m.kind === 'home')
    return points.filter((p) => topAirports.has(p.iata)).map((p) => ({ ...p, text: p.iata }))
  }, [flights, markers, points, topAirports])

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

  const routeCount = useCallback((arc: RouteArc) => countUpTo(arc.flights, limit), [limit])

  const arcColor = useCallback(
    (obj: object) => {
      const arc = asArc(obj)
      if (arc.kind === 'comet') return ['rgba(255, 243, 196, 0)', COLORS.arcActive]
      if (arc.kind === 'route') {
        const alpha = 0.35 + 0.55 * Math.min(1, routeCount(arc) / 12)
        return `rgba(255, 196, 37, ${alpha.toFixed(2)})`
      }
      if (activeLeg === null) return [COLORS.arcFrom, COLORS.arcTo]
      return arc.index === activeLeg ? [COLORS.arcActive, COLORS.arcActive] : [COLORS.arcDim, COLORS.arcDim]
    },
    [activeLeg, routeCount],
  )

  const arcStroke = useCallback(
    (obj: object) => {
      const arc = asArc(obj)
      if (arc.kind === 'comet') return 0.9
      if (arc.kind === 'route') return 0.18 + 0.16 * Math.sqrt(routeCount(arc))
      return arc.index === activeLeg ? 1.1 : 0.6
    },
    [activeLeg, routeCount],
  )

  const arcLabel = useCallback(
    (obj: object) => {
      const arc = asArc(obj)
      if (arc.kind === 'comet') return ''
      if (arc.kind === 'route') {
        const n = routeCount(arc)
        return `<div class="tip"><span class="tip__code">${escapeHtml(arc.label)}</span><span class="tip__name">${n} ${n === 1 ? 'flight' : 'flights'}</span><span class="tip__status">${formatKm(arc.km)} each way</span></div>`
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
      // Airports
      pointsData={points}
      pointLat={(obj: object) => asPoint(obj).lat}
      pointLng={(obj: object) => asPoint(obj).lng}
      pointColor={() => COLORS.airport}
      pointAltitude={0.006}
      pointRadius={(obj: object) => 0.14 + 0.045 * Math.sqrt(countUpTo(asPoint(obj).flights, limit))}
      pointsTransitionDuration={0}
      pointLabel={(obj: object) => {
        const p = asPoint(obj)
        const n = countUpTo(p.flights, limit)
        return `<div class="tip"><span class="tip__code">${p.iata}</span><span class="tip__name">${escapeHtml(p.city)}</span><span class="tip__status">${n} ${n === 1 ? 'visit' : 'visits'}</span></div>`
      }}
      // Pulses
      ringsData={markers}
      ringLat={(obj: object) => asMarker(obj).lat}
      ringLng={(obj: object) => asMarker(obj).lng}
      ringColor={(obj: object) =>
        asMarker(obj).kind === 'home'
          ? (t: number) => `rgba(212, 67, 44, ${1 - t})`
          : (t: number) => `rgba(255, 243, 196, ${1 - t})`
      }
      ringMaxRadius={(obj: object) => ({ home: 3.2, selected: 4.5, arrival: 2.4 })[asMarker(obj).kind]}
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
