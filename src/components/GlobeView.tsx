import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Globe, { type GlobeMethods } from 'react-globe.gl'
import { Color, MeshPhongMaterial } from 'three'
import type { Atlas, Country } from '../geo/atlas'
import type { LatLng } from '../geo/sphere'
import { escapeHtml, formatKm, pad2 } from '../lib/format'

export interface CameraTarget extends LatLng {
  altitude: number
}

interface Props {
  atlas: Atlas
  width: number
  height: number
  selected: Country | null
  /** Route leg to emphasise during the tour (0 = home → first stop). */
  activeLeg: number | null
  showRoute: boolean
  autoRotate: boolean
  reducedMotion: boolean
  camera: CameraTarget | null
  onSelect: (code: string | null) => void
}

interface Arc {
  index: number
  startLat: number
  startLng: number
  endLat: number
  endLng: number
  km: number
  label: string
}

interface Marker extends LatLng {
  kind: 'home' | 'selected'
  text: string
}

const COLORS = {
  visited: '#ffc425',
  visitedHover: '#ffd766',
  selected: '#fff3c4',
  land: '#2d323a',
  landHover: '#454b55',
  landSelected: '#6b7280',
  visitedSide: 'rgba(255, 196, 37, 0.32)',
  landSide: 'rgba(45, 50, 58, 0.55)',
  stroke: 'rgba(241, 235, 222, 0.13)',
  home: '#d4432c',
  arcFrom: 'rgba(212, 67, 44, 0.85)',
  arcTo: 'rgba(255, 196, 37, 0.95)',
  arcDim: 'rgba(241, 235, 222, 0.16)',
  arcActive: '#fff3c4',
}

const INITIAL_VIEW: CameraTarget = { lat: 24, lng: -38, altitude: 2.35 }

const globeMaterial = new MeshPhongMaterial({
  color: new Color('#101722'),
  emissive: new Color('#060a10'),
  emissiveIntensity: 1,
  shininess: 6,
})

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
  width,
  height,
  selected,
  activeLeg,
  showRoute,
  autoRotate,
  reducedMotion,
  camera,
  onSelect,
}: Props) {
  const globeRef = useRef<GlobeMethods | undefined>(undefined)
  const [ready, setReady] = useState(false)
  const [hovered, setHovered] = useState<Country | null>(null)

  const arcs = useMemo<Arc[]>(() => {
    const sequence: (LatLng & { name: string })[] = [
      { ...atlas.home, name: atlas.home.name },
      ...atlas.visited.map((c) => ({ ...c.center, name: c.name })),
      { ...atlas.home, name: atlas.home.name },
    ]
    return atlas.route.legs.map((leg, index) => ({
      index,
      startLat: sequence[index].lat,
      startLng: sequence[index].lng,
      endLat: sequence[index + 1].lat,
      endLng: sequence[index + 1].lng,
      km: leg.km,
      label: `${sequence[index].name} → ${sequence[index + 1].name}`,
    }))
  }, [atlas])

  const markers = useMemo<Marker[]>(() => {
    const list: Marker[] = [{ ...atlas.home, kind: 'home', text: atlas.home.code }]
    if (selected) list.push({ ...selected.center, kind: 'selected', text: selected.code })
    return list
  }, [atlas.home, selected])

  // Configure orbit controls once the scene exists.
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
    globe.controls().autoRotate = autoRotate && !reducedMotion
  }, [ready, autoRotate, reducedMotion])

  useEffect(() => {
    const globe = globeRef.current
    if (!ready || !globe || !camera) return
    globe.pointOfView(camera, reducedMotion ? 0 : 1400)
  }, [ready, camera, reducedMotion])

  const asCountry = (obj: object) => obj as Country
  // react-globe.gl types coordinates as number[]; our Geometry type is more precise.
  const geometryOf = (obj: object) =>
    asCountry(obj).feature.geometry as unknown as { type: string; coordinates: number[] }
  const asArc = (obj: object) => obj as Arc
  const asMarker = (obj: object) => obj as Marker

  const capColor = useCallback(
    (obj: object) => {
      const c = asCountry(obj)
      if (c === selected) return c.visited ? COLORS.selected : COLORS.landSelected
      if (c === hovered) return c.visited ? COLORS.visitedHover : COLORS.landHover
      return c.visited ? COLORS.visited : COLORS.land
    },
    [selected, hovered],
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

  const arcColor = useCallback(
    (obj: object) => {
      const arc = asArc(obj)
      if (activeLeg === null) return [COLORS.arcFrom, COLORS.arcTo]
      return arc.index === activeLeg ? [COLORS.arcActive, COLORS.arcActive] : [COLORS.arcDim, COLORS.arcDim]
    },
    [activeLeg],
  )

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
      // Route
      arcsData={showRoute ? arcs : []}
      arcColor={arcColor}
      arcStroke={(obj: object) => (asArc(obj).index === activeLeg ? 1.1 : 0.6)}
      arcAltitudeAutoScale={0.38}
      arcDashLength={0.45}
      arcDashGap={0.18}
      arcDashInitialGap={(obj: object) => (asArc(obj).index % 5) * 0.12}
      arcDashAnimateTime={reducedMotion ? 0 : 3200}
      arcsTransitionDuration={0}
      arcLabel={(obj: object) => {
        const arc = asArc(obj)
        return `<div class="tip"><span class="tip__code">Leg ${pad2(arc.index + 1)}</span><span class="tip__name">${escapeHtml(arc.label)}</span><span class="tip__status">${formatKm(arc.km)}</span></div>`
      }}
      // Home + selection pulses
      ringsData={markers}
      ringLat={(obj: object) => asMarker(obj).lat}
      ringLng={(obj: object) => asMarker(obj).lng}
      ringColor={(obj: object) =>
        asMarker(obj).kind === 'home'
          ? (t: number) => `rgba(212, 67, 44, ${1 - t})`
          : (t: number) => `rgba(255, 243, 196, ${1 - t})`
      }
      ringMaxRadius={(obj: object) => (asMarker(obj).kind === 'home' ? 3.2 : 4.5)}
      ringPropagationSpeed={2.2}
      ringRepeatPeriod={reducedMotion ? 0 : 1300}
      labelsData={markers.filter((m) => m.kind === 'home')}
      labelLat={(obj: object) => asMarker(obj).lat}
      labelLng={(obj: object) => asMarker(obj).lng}
      labelText={(obj: object) => asMarker(obj).text}
      labelColor={() => COLORS.selected}
      labelSize={1.05}
      labelDotRadius={0.45}
      labelAltitude={0.014}
      labelResolution={3}
    />
  )
}
