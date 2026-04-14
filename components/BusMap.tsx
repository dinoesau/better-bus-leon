'use client'

import { useEffect, useRef, useState } from 'react'
import { setOptions, importLibrary } from '@googlemaps/js-api-loader'
import styles from './BusMap.module.css'
import { createOriginMarker, createDestinationMarker, createStopMarker, createBusMarker } from '../lib/map-markers'

const ORIGIN = { lat: 21.123232, lng: -101.731127 }
const DESTINATION = { lat: 21.13129, lng: -101.71705 }
const ALLOWED_LINES = ['A-03', 'A-75'] as const
type AllowedLine = typeof ALLOWED_LINES[number]
const ROUTE_COLORS: Record<string, string> = { 'A-03': '#E53E3E', 'A-75': '#2B6CB0' }

let googleMapsOptionsSet = false

interface Bus {
  id: string
  latitude: number
  longitude: number
}

type KmlCoords = { lat: number; lng: number }[]
type KmlRouteData = Record<string, KmlCoords | { lat: number; lng: number }>

// --- Routes API types ---
interface TransitLine {
  shortName?: string
  name?: string
  vehicle?: {
    name?: string
    type?: string
    icon?: { uri: string }
  }
}

interface TransitStop {
  name?: string
  location?: {
    lat?: number
    lng?: number
  }
}

interface TransitDetails {
  transitLine?: TransitLine
  departureStop?: TransitStop
  arrivalStop?: TransitStop
  departureTime?: { time?: Date }
  arrivalTime?: { time?: Date }
  numStops?: number
}

interface RouteLegStep {
  travelMode: string
  transitDetails?: TransitDetails
  navigationInstruction?: {
    instructions?: string
  }
}

interface RouteLeg {
  steps: RouteLegStep[]
  duration?: { text: string }
  distanceMeters?: number
}

interface TransitRoute {
  legs: RouteLeg[]
  durationMillis?: number
  distanceMeters?: number
  path?: google.maps.LatLngAltitude[]
}

// --- KML utilities ---
function parseKmlCoords(text: string) {
  return text.trim().split(/\s+/).map((c) => {
    const parts = c.split(',')
    return { lat: parseFloat(parts[1]), lng: parseFloat(parts[0]) }
  }).filter((c) => !isNaN(c.lat) && !isNaN(c.lng))
}

async function loadRouteKml(routeId: string): Promise<KmlRouteData> {
  const res = await fetch(`/data/${routeId}.kml`)
  const text = await res.text()
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  const out: KmlRouteData = {}
  doc.querySelectorAll('Placemark').forEach((pm) => {
    const name = pm.querySelector('name')?.textContent?.trim()
    const lc = pm.querySelector('LineString coordinates')
    const pc = pm.querySelector('Point coordinates')
    if (name && lc) out[name] = parseKmlCoords(lc.textContent || '')
    if (name && pc && !lc) {
      const parts = (pc.textContent || '').trim().split(',')
      out[name] = { lat: parseFloat(parts[1]), lng: parseFloat(parts[0]) }
    }
  })
  return out
}

function nearestIdx(coords: KmlCoords, lat: number, lng: number) {
  let best = 0
  let bestDist = Infinity
  coords.forEach((c, i) => {
    const d = (c.lat - lat) ** 2 + (c.lng - lng) ** 2
    if (d < bestDist) { bestDist = d; best = i }
  })
  return best
}

function detectDirection(kml: KmlRouteData, lineName: string, boardingLat: number, boardingLng: number, alightingLat: number, alightingLng: number) {
  for (const suffix of ['ida', 'regreso']) {
    const data = kml[`${lineName}-${suffix}`]
    if (!data || !Array.isArray(data) || data.length < 2) continue
    const coords = data as KmlCoords
    const bIdx = nearestIdx(coords, boardingLat, boardingLng)
    const aIdx = nearestIdx(coords, alightingLat, alightingLng)
    if (aIdx > bIdx) return { coords, boardingIdx: bIdx, alightingIdx: aIdx }
  }
  return null
}

function drawPolyline(map: google.maps.Map, path: google.maps.LatLngLiteral[], color: string, weight: number, opacity: number, zIndex: number) {
  return new google.maps.Polyline({ map, path, strokeColor: color, strokeWeight: weight, strokeOpacity: opacity, zIndex })
}

export default function BusMap() {
  const mapRef = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<google.maps.Map | null>(null)
  const [MarkerClass, setMarkerClass] = useState<typeof google.maps.marker.AdvancedMarkerElement | null>(null)
  const overlaysRef = useRef<(google.maps.Polyline | google.maps.marker.AdvancedMarkerElement)[]>([])
  
  const [busData, setBusData] = useState<Record<string, { loading: boolean, error: boolean, data: Bus[] }>>({
    'A-03': { loading: true, error: false, data: [] },
    'A-75': { loading: true, error: false, data: [] },
  })
  
  const [kmlData, setKmlData] = useState<Record<string, KmlRouteData>>({})
  const [routes, setRoutes] = useState<TransitRoute[]>([])
  const [selectedRouteIdx, setSelectedRouteIdx] = useState<number | null>(null)

  // Initialize Map
  useEffect(() => {
    let cancelled = false
    async function initMap() {
      if (!googleMapsOptionsSet) {
        setOptions({ key: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!, v: 'weekly' })
        googleMapsOptionsSet = true
      }
      const { Map } = await importLibrary('maps') as google.maps.MapsLibrary
      const { AdvancedMarkerElement } = await importLibrary('marker') as google.maps.MarkerLibrary
      
      setMarkerClass(() => AdvancedMarkerElement)
      
      if (cancelled || !mapRef.current) return
      const mapInstance = new Map(mapRef.current, {
        center: { lat: (ORIGIN.lat + DESTINATION.lat) / 2, lng: (ORIGIN.lng + DESTINATION.lng) / 2 },
        zoom: 14, mapId: 'bus-routes-map', mapTypeControl: false, streetViewControl: false, fullscreenControl: true,
      })
      setMap(mapInstance)
    }
    initMap()
    return () => { cancelled = true }
  }, [])

  // Load Bus Locations and KML
  useEffect(() => {
    async function loadData() {
      const lines = [
        { id: 'A-03', apiPath: '/api/location?ruta=A-03' },
        { id: 'A-75', apiPath: '/api/location?ruta=A-75' },
      ]
      
      const fetchLines = async () => {
        lines.forEach(async (line) => {
          try {
            const res = await fetch(line.apiPath); const json = await res.json()
            setBusData(prev => ({ ...prev, [line.id]: { loading: false, error: false, data: json.buses || [] } }))
          } catch { setBusData(prev => ({ ...prev, [line.id]: { loading: false, error: true, data: [] } })) }
        })
      }
      
      await fetchLines()
      const interval = setInterval(fetchLines, 20000)
      
      const kml: Record<string, KmlRouteData> = {}
      await Promise.all(ALLOWED_LINES.map(async (id) => { kml[id] = await loadRouteKml(id) }))
      setKmlData(kml)
      
      return () => clearInterval(interval)
    }
    loadData()
  }, [])

  // Load Directions
  useEffect(() => {
    if (!map) return
    async function loadDirections() {
      const routesLib = await importLibrary('routes') as unknown as { Route: { computeRoutes: (request: { origin: { lat: number; lng: number }; destination: { lat: number; lng: number }; travelMode: google.maps.TravelMode; computeAlternativeRoutes?: boolean; transitPreference?: string; fields: string[] }) => Promise<{ routes?: TransitRoute[] }> } }
      const Route = routesLib.Route
      const { routes: newRoutes } = await Route.computeRoutes({
        origin: ORIGIN,
        destination: DESTINATION,
        travelMode: google.maps.TravelMode.TRANSIT,
        computeAlternativeRoutes: true,
        fields: ['*'],
      })
      if (!newRoutes) return

      const directRoutes = newRoutes.filter((route: TransitRoute) => {
        const legs = route.legs || []
        if (legs.length === 0) return false
        const transitSteps = legs[0].steps?.filter((s: RouteLegStep) => s.travelMode === google.maps.TravelMode.TRANSIT) || []
        if (transitSteps.length !== 1) return false
        const lineName = transitSteps[0].transitDetails?.transitLine?.shortName || transitSteps[0].transitDetails?.transitLine?.name || ''
        return ALLOWED_LINES.includes(lineName as AllowedLine)
      })
      setRoutes(directRoutes)
    }
    loadDirections()
  }, [map])

  // Render Overlays
  useEffect(() => {
    if (!map || !MarkerClass || routes.length === 0 || Object.keys(kmlData).length === 0) return
    // Cleanup old overlays
    overlaysRef.current.forEach(overlay => {
        if ('setMap' in overlay) {
            (overlay as google.maps.Polyline).setMap(null);
        } else {
            overlay.map = null;
        }
    })
    overlaysRef.current = []

    routes.forEach((route, idx) => {
      const isSelected = selectedRouteIdx === idx
      const legs = route.legs || []
      if (legs.length === 0) return
      
      const transitSteps = legs[0].steps?.filter((s: RouteLegStep) => s.travelMode === google.maps.TravelMode.TRANSIT) || []
      if (transitSteps.length === 0) return
      
      const transitStep = transitSteps[0]
      const lineName = transitStep.transitDetails?.transitLine?.shortName || transitStep.transitDetails?.transitLine?.name || ''
      const color = ROUTE_COLORS[lineName] || '#555'
      
      if (kmlData[lineName]) {
        // 1. Draw all segments of this line (ida, regreso, etc.)
        Object.entries(kmlData[lineName]).forEach(([name, data]) => {
          if (Array.isArray(data)) {
            const isRegreso = name.toLowerCase().includes('regreso')
            const opacity = isRegreso ? 0.6 : 1.0
            const weight = isRegreso ? 4 : 6
            const poly = drawPolyline(map, data as KmlCoords, color, weight, opacity, 10)
            overlaysRef.current.push(poly)
          }
        })

        // 2. Add Bus Markers
        const buses = busData[lineName]?.data || []
        buses.forEach((bus) => {
          const busMarker = new MarkerClass({ map, position: { lat: bus.latitude, lng: bus.longitude }, content: createBusMarker(lineName, color, { busMarker: styles.busMarker, busMarkerIcon: styles.busMarkerIcon, busMarkerLineLabel: styles.busMarkerLineLabel }), title: `Bus ${bus.id}` })
          overlaysRef.current.push(busMarker)
        })

        if (isSelected) {
          const bounds = new google.maps.LatLngBounds()
          Object.values(kmlData[lineName]).forEach(val => {
            if (Array.isArray(val)) val.forEach(c => bounds.extend(c))
          })
          map.fitBounds(bounds, 60)
        }
      }
    })
  }, [map, routes, selectedRouteIdx, kmlData, MarkerClass, busData])

  return (
    <div className={styles.mapContainer}>
      <div ref={mapRef} className={styles.map} style={{ height: '100%', width: '100%' }} />
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <div className={styles.busStatus}>
            {Object.entries(busData).map(([id, status]) => (
              <div key={id} className={styles.routeStatus}>
                <span className={`${styles.statusDot} ${status.loading ? styles.statusLoading : status.error ? styles.statusError : styles.statusOk}`} />
                <span>{id} · {status.loading ? '...' : status.error ? 'sin datos' : `${status.data.length} activas`}</span>
              </div>
            ))}
          </div>
        </div>
        <div className={styles.routesList}>
          {routes.map((route, idx) => (
             <div key={idx} className={`${styles.routeCard} ${selectedRouteIdx === idx ? styles.selected : ''}`} onClick={() => setSelectedRouteIdx(idx)}>
               Route {idx + 1} ({route.durationMillis ? `${Math.round(route.durationMillis / 60000)} min` : 'N/A'})
             </div>
           ))}
        </div>
        <div className={styles.authorCard}>
          <div className={styles.authorInfo}>
            <span className={styles.authorName}>Built by Esau Martinez</span>
            <span className={styles.authorRole}>Developer</span>
          </div>
          <div className={styles.authorLinks}>
            <a href="https://github.com/dinoesau" target="_blank" rel="noopener noreferrer" className={styles.authorLink}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
              </svg>
              GitHub
            </a>
            <a href="mailto:contact@esau.com.mx" className={styles.authorLink}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="4" width="20" height="16" rx="2"/>
                <path d="M22 4L12 13L2 4"/>
              </svg>
              Email
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
