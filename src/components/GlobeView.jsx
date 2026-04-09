import { startTransition, useEffect, useRef, useState } from 'react'
import Globe from 'react-globe.gl'
import { Color, MeshPhongMaterial } from 'three'
import {
  escapeHtml,
  getCountryName,
  isVisited,
} from '../utils/countryHelpers.js'

const COUNTRIES_DATA_URL = `${import.meta.env.BASE_URL}data/countries.geojson`

const COLORS = {
  visited: '#2dd4bf',
  unvisited: 'rgba(71, 85, 105, 0.92)',
  stroke: 'rgba(148, 163, 184, 0.16)',
  sideVisited: 'rgba(45, 212, 191, 0.22)',
  sideUnvisited: 'rgba(71, 85, 105, 0.14)',
}

const globeMaterial = new MeshPhongMaterial({
  color: new Color('#08111d'),
  emissive: new Color('#030711'),
  emissiveIntensity: 1.05,
  shininess: 8,
})

function getPolygonFeatures(geoJson) {
  if (!Array.isArray(geoJson?.features)) {
    return []
  }

  // Keep the globe layer limited to polygon geometries so odd records never break rendering.
  return geoJson.features.filter((feature) => {
    const geometryType = feature?.geometry?.type
    return geometryType === 'Polygon' || geometryType === 'MultiPolygon'
  })
}

function GlobeView({ visitedCountrySet }) {
  const containerRef = useRef(null)
  const globeRef = useRef(null)
  const hasConfiguredViewRef = useRef(false)

  const [countries, setCountries] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isGlobeReady, setIsGlobeReady] = useState(false)
  const [dimensions, setDimensions] = useState({ width: 720, height: 560 })

  useEffect(() => {
    const element = containerRef.current

    if (!element) {
      return undefined
    }

    const updateDimensions = () => {
      const nextWidth = Math.max(320, Math.floor(element.clientWidth))
      const nextHeight = Math.floor(
        nextWidth < 640
          ? Math.max(400, nextWidth * 1.08)
          : Math.max(520, nextWidth * 0.78),
      )

      setDimensions((currentDimensions) => {
        if (
          currentDimensions.width === nextWidth &&
          currentDimensions.height === nextHeight
        ) {
          return currentDimensions
        }

        return {
          width: nextWidth,
          height: nextHeight,
        }
      })
    }

    updateDimensions()

    const resizeObserver = new ResizeObserver(updateDimensions)
    resizeObserver.observe(element)

    return () => resizeObserver.disconnect()
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadCountries() {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch(COUNTRIES_DATA_URL)

        if (!response.ok) {
          throw new Error(`Failed to fetch countries: ${response.status}`)
        }

        const data = await response.json()
        const features = getPolygonFeatures(data)

        if (cancelled) {
          return
        }

        startTransition(() => {
          setCountries(features)
        })
      } catch {
        if (!cancelled) {
          setError('Country boundary data could not be loaded.')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    loadCountries()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!isGlobeReady || !globeRef.current) {
      return
    }

    const controls = globeRef.current.controls?.()

    if (controls) {
      controls.autoRotate = true
      controls.autoRotateSpeed = 0.32
      controls.enableDamping = true
      controls.dampingFactor = 0.05
      controls.enablePan = false
      controls.minDistance = 140
      controls.maxDistance = 420
    }

    if (!hasConfiguredViewRef.current) {
      globeRef.current.pointOfView?.({ lat: 22, lng: 12, altitude: 2.02 }, 0)
      hasConfiguredViewRef.current = true
    }
  }, [isGlobeReady])

  const getLabel = (feature) => {
    const countryName = escapeHtml(getCountryName(feature))
    const visited = isVisited(feature, visitedCountrySet)
    const statusClass = visited
      ? 'globe-tooltip__status globe-tooltip__status--visited'
      : 'globe-tooltip__status'

    return `
      <div class="globe-tooltip">
        <span class="globe-tooltip__name">${countryName}</span>
        <span class="${statusClass}">${visited ? 'Visited' : 'Not visited'}</span>
      </div>
    `
  }

  const getCapColor = (feature) =>
    isVisited(feature, visitedCountrySet)
      ? COLORS.visited
      : COLORS.unvisited

  const getSideColor = (feature) =>
    isVisited(feature, visitedCountrySet)
      ? COLORS.sideVisited
      : COLORS.sideUnvisited

  const getAltitude = (feature) =>
    isVisited(feature, visitedCountrySet) ? 0.0045 : 0.0025

  return (
    <div ref={containerRef} className="globe-stage">
      <div className="globe-canvas">
        <Globe
          ref={globeRef}
          width={dimensions.width}
          height={dimensions.height}
          backgroundColor="rgba(0, 0, 0, 0)"
          globeMaterial={globeMaterial}
          showAtmosphere
          atmosphereColor="#38bdf8"
          atmosphereAltitude={0.12}
          animateIn={false}
          polygonsData={countries}
          polygonGeoJsonGeometry={(feature) => feature?.geometry}
          polygonCapColor={getCapColor}
          polygonSideColor={getSideColor}
          polygonStrokeColor={() => COLORS.stroke}
          polygonAltitude={getAltitude}
          polygonLabel={getLabel}
          polygonsTransitionDuration={0}
          polygonCapCurvatureResolution={3}
          onGlobeReady={() => setIsGlobeReady(true)}
        />
      </div>

      {(isLoading || error) && (
        <div className="globe-stage__overlay" role={error ? 'alert' : 'status'}>
          {isLoading ? (
            <div className="globe-loading">
              <div className="globe-loading__orb" aria-hidden="true" />
              <strong>Loading country boundaries...</strong>
              <p>
                The globe will become interactive as soon as the GeoJSON
                dataset finishes loading.
              </p>
            </div>
          ) : (
            <div className="globe-error">
              <strong>Unable to load the travel globe.</strong>
              <p>{error}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default GlobeView
