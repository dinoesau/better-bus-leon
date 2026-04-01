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

interface Bus {
  id: string
  latitude: number
  longitude: number
}

type KmlCoords = { lat: number; lng: number }[]
type KmlRouteData = Record<string, KmlCoords | { lat: number; lng: number }>

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
  const [routes, setRoutes] = useState<google.maps.DirectionsRoute[]>([])
  const [selectedRouteIdx, setSelectedRouteIdx] = useState<number | null>(null)

  // Initialize Map
  useEffect(() => {
    let cancelled = false
    async function initMap() {
      setOptions({ key: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!, v: 'weekly' })
      const { Map } = await importLibrary('maps') as google.maps.MapsLibrary
      const { AdvancedMarkerElement } = await importLibrary('marker') as google.maps.MarkerLibrary
      
      setMarkerClass(() => AdvancedMarkerElement)
      
      if (cancelled || !mapRef.current) return
      const mapInstance = new Map(mapRef.current, {
        center: { lat: (ORIGIN.lat + DESTINATION.lat) / 2, lng: (ORIGIN.lng + DESTINATION.lng) / 2 },
        zoom: 14, mapId: 'bus-routes-map', mapTypeControl: false, streetViewControl: false, fullscreenControl: true,
      })
      // Markers
      new AdvancedMarkerElement({ map: mapInstance, position: ORIGIN, content: createOriginMarker(), title: 'Tu origen' })
      new AdvancedMarkerElement({ map: mapInstance, position: DESTINATION, content: createDestinationMarker(), title: 'Tu destino' })
      setMap(mapInstance)
    }
    initMap()
    return () => { cancelled = true }
  }, [])

  // Load Bus Locations and KML
  useEffect(() => {
    async function loadData() {
      const lines = [
        { id: 'A-03', apiPath: '/api/a03-location' },
        { id: 'A-75', apiPath: '/api/a75-location' },
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
      const interval = setInterval(fetchLines, 30000)
      
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
      const { DirectionsService } = await importLibrary('routes') as google.maps.RoutesLibrary
      new DirectionsService().route({
        origin: ORIGIN, destination: DESTINATION, travelMode: google.maps.TravelMode.TRANSIT, provideRouteAlternatives: true,
        transitOptions: { modes: [google.maps.TransitMode.BUS], routingPreference: google.maps.TransitRoutePreference.FEWER_TRANSFERS },
      }, (result, status) => {
        if (status !== 'OK' || !result) return
        const directRoutes = result.routes.filter((route) => {
          const transitSteps = route.legs[0].steps.filter(s => s.travel_mode === google.maps.TravelMode.TRANSIT)
          if (transitSteps.length !== 1) return false
          const lineName = transitSteps[0].transit?.line.short_name || transitSteps[0].transit?.line.name || ''
          return ALLOWED_LINES.includes(lineName as AllowedLine)
        })
        setRoutes(directRoutes)
      })
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
      const transitStep = route.legs[0].steps.find(s => s.travel_mode === google.maps.TravelMode.TRANSIT)!
      const lineName = transitStep.transit?.line.short_name || transitStep.transit?.line.name || ''
      const color = ROUTE_COLORS[lineName] || '#555'
      const direction = kmlData[lineName] ? detectDirection(kmlData[lineName], lineName, transitStep.transit!.departure_stop.location.lat(), transitStep.transit!.departure_stop.location.lng(), transitStep.transit!.arrival_stop.location.lat(), transitStep.transit!.arrival_stop.location.lng()) : null
      
      if (direction) {
        const { coords, boardingIdx, alightingIdx } = direction
        
        // 1. Draw full route (low opacity)
        const fullRoutePoly = drawPolyline(map, coords, color, 4, 0.2, 5)
        overlaysRef.current.push(fullRoutePoly)
        
        // 2. Draw active segment (high opacity/thicker)
        const activePoly = drawPolyline(map, coords.slice(boardingIdx, alightingIdx + 1), color, 6, 1, 10)
        overlaysRef.current.push(activePoly)

        // 3. Add stop markers
        const bMarker = new MarkerClass({ map, position: coords[boardingIdx], content: createStopMarker(color), title: `Abordas` })
        overlaysRef.current.push(bMarker)
        const aMarker = new MarkerClass({ map, position: coords[alightingIdx], content: createStopMarker(color), title: `Bajas` })
        overlaysRef.current.push(aMarker)

        // 4. Add Bus Markers
        const buses = busData[lineName]?.data || []
        buses.forEach((bus) => {
          const busMarker = new MarkerClass({ map, position: { lat: bus.latitude, lng: bus.longitude }, content: createBusMarker(lineName, color, { busMarker: styles.busMarker, busMarkerIcon: styles.busMarkerIcon, busMarkerLineLabel: styles.busMarkerLineLabel }), title: `Bus ${bus.id}` })
          overlaysRef.current.push(busMarker)
        })

        if (isSelected) {
          const bounds = new google.maps.LatLngBounds()
          coords.slice(0, alightingIdx + 1).forEach((c) => bounds.extend(c))
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
               Route {idx + 1} ({route.legs[0].duration?.text})
             </div>
           ))}
        </div>
      </div>
    </div>
  )
}
