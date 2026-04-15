'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import { setOptions, importLibrary } from '@googlemaps/js-api-loader'
import styles from './BusMap.module.css'
import { createBusMarker, createUserMarker } from '../lib/map-markers'
import { routes as routeMetadata } from '../data/routes'
import { VALID_ROUTE_IDS } from '../lib/route-config'

const STORAGE_KEY = 'preferred-bus-routes-v2' // Versioned key for multi-select
const OLD_STORAGE_KEY = 'preferred-bus-route'
const DEFAULT_ROUTES = ['A-03', 'A-31', 'L-04', 'X-04']
const MAX_SELECTION = 5

let googleMapsOptionsSet = false

interface Bus {
  id: string
  latitude: number
  longitude: number
}

interface RouteBusState {
  loading: boolean
  error: boolean
  data: Bus[]
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
  if (!res.ok) return {}
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

function drawPolyline(map: google.maps.Map, path: google.maps.LatLngLiteral[], color: string, weight: number, opacity: number, zIndex: number) {
  return new google.maps.Polyline({ map, path, strokeColor: color, strokeWeight: weight, strokeOpacity: opacity, zIndex })
}

export default function BusMap() {
  const mapRef = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<google.maps.Map | null>(null)
  const [MarkerClass, setMarkerClass] = useState<typeof google.maps.marker.AdvancedMarkerElement | null>(null)
  
  // User Location
  const [userPosition, setUserPosition] = useState<google.maps.LatLngLiteral | null>(null)
  const userMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null)

  // Refs for managing state and overlays
  const hasInitialFit = useRef(false)
  const overlaysRef = useRef<Record<string, (google.maps.Polyline | google.maps.marker.AdvancedMarkerElement)[]>>({})
  const endpointMarkersRef = useRef<Record<string, google.maps.marker.AdvancedMarkerElement[]>>({})
  
  // State for selection
  const [selectedRouteIds, setSelectedRouteIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return DEFAULT_ROUTES
    const savedV2 = localStorage.getItem(STORAGE_KEY)
    if (savedV2) {
      try {
        const parsed = JSON.parse(savedV2)
        if (Array.isArray(parsed)) {
          const valid = parsed.filter(id => VALID_ROUTE_IDS.includes(id)).slice(0, MAX_SELECTION)
          if (valid.length > 0) return valid
        }
      } catch (e) { console.error('Failed to parse saved routes', e) }
    }
    
    // Legacy migration check (will be cleaned up in useEffect)
    const savedV1 = localStorage.getItem(OLD_STORAGE_KEY)
    if (savedV1 && VALID_ROUTE_IDS.includes(savedV1)) {
      return [savedV1]
    }
    
    return DEFAULT_ROUTES
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isTrayExpanded, setIsTrayExpanded] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showToast, setShowToast] = useState(false)
  const [vvHeight, setVvHeight] = useState('100dvh')

  // Visual Viewport Tracking (for mobile keyboards)
  useEffect(() => {
    if (!window.visualViewport) return

    const handleResize = () => {
      setVvHeight(`${window.visualViewport?.height || window.innerHeight}px`)
    }

    window.visualViewport.addEventListener('resize', handleResize)
    handleResize() // Initial call

    return () => window.visualViewport?.removeEventListener('resize', handleResize)
  }, [])
  
  // Real-time data maps
  const [busDataMap, setBusDataMap] = useState<Record<string, RouteBusState>>({})
  const [kmlDataMap, setKmlDataMap] = useState<Record<string, KmlRouteData>>({})

  // 1. Initialization: Legacy Cleanup
  useEffect(() => {
    const savedV1 = localStorage.getItem(OLD_STORAGE_KEY)
    if (savedV1) {
      localStorage.removeItem(OLD_STORAGE_KEY)
      // If we are here, we already migrated in the lazy initializer
      // but we need to ensure the new format is persisted if it was a migration
      localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedRouteIds))
    }
  }, [selectedRouteIds])

  // 2. Search Logic
  const filteredRoutes = useMemo(() => {
    const query = searchQuery.toLowerCase()
    return VALID_ROUTE_IDS.filter(id => 
      id.toLowerCase().includes(query) || 
      routeMetadata[id]?.name.toLowerCase().includes(query) ||
      routeMetadata[id]?.description.toLowerCase().includes(query)
    )
  }, [searchQuery])

  const toggleRoute = (id: string) => {
    setSelectedRouteIds(prev => {
      if (prev.includes(id)) return prev.filter(r => r !== id)
      if (prev.length >= MAX_SELECTION) return prev
      return [...prev, id]
    })
    setSearchQuery('')
    setIsSearchOpen(false)
  }

  // 3. Initialize Map
  useEffect(() => {
    async function initMap() {
      if (!googleMapsOptionsSet) {
        setOptions({ key: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!, v: 'weekly' })
        googleMapsOptionsSet = true
      }
      const { Map } = await importLibrary('maps') as google.maps.MapsLibrary
      const { AdvancedMarkerElement } = await importLibrary('marker') as google.maps.MarkerLibrary
      setMarkerClass(() => AdvancedMarkerElement)
      
      if (!mapRef.current) return
      const mapInstance = new Map(mapRef.current, {
        center: { lat: 21.1200, lng: -101.7210 },
        zoom: 13, 
        mapId: 'bus-routes-map', 
        mapTypeControl: false, 
        streetViewControl: false, 
        fullscreenControl: false,
        rotateControl: false,
        scaleControl: false,
      })
      setMap(mapInstance)
    }
    initMap()
  }, [])

  // 4. User Location Tracking
  useEffect(() => {
    if (!('geolocation' in navigator)) return

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setUserPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude
        })
      },
      (err) => console.error('Geolocation error:', err),
      { enableHighAccuracy: true, maximumAge: 10000 }
    )

    return () => navigator.geolocation.clearWatch(watchId)
  }, [])

  // Update/Create User Marker
  useEffect(() => {
    if (!map || !MarkerClass || !userPosition) return

    if (!userMarkerRef.current) {
      userMarkerRef.current = new MarkerClass({
        map,
        position: userPosition,
        title: 'Tu ubicación',
        content: createUserMarker(styles.userLocationMarker),
        zIndex: 200
      })
    } else {
      userMarkerRef.current.position = userPosition
    }
  }, [map, MarkerClass, userPosition])

  // 5. Data Loading & Polling
  // 4a. KML Loading (Independent of polling)
  useEffect(() => {
    selectedRouteIds.forEach(id => {
      if (!kmlDataMap[id]) {
        loadRouteKml(id).then(kml => {
          setKmlDataMap(prev => {
            if (prev[id]) return prev // Already loaded
            return { ...prev, [id]: kml }
          })
        })
      }
    })
  }, [selectedRouteIds, kmlDataMap])

  // 4b. Location Polling Registry
  useEffect(() => {
    const intervals: Record<string, NodeJS.Timeout> = {}

    selectedRouteIds.forEach(id => {
      const fetchLocations = async () => {
        try {
          const res = await fetch(`/api/location?ruta=${id}`)
          const json = await res.json()
          setBusDataMap(prev => ({ ...prev, [id]: { loading: false, error: false, data: json.buses || [] } }))
        } catch {
          setBusDataMap(prev => ({ ...prev, [id]: { loading: false, error: true, data: [] } }))
        }
      }
      
      // Only set loading if we don't have data yet
      setBusDataMap(prev => {
        if (prev[id]) return prev
        return { ...prev, [id]: { loading: true, error: false, data: [] } }
      })

      fetchLocations()
      intervals[id] = setInterval(fetchLocations, 20000)
    })

    return () => {
      Object.values(intervals).forEach(clearInterval)
    }
  }, [selectedRouteIds])

  // 5. Smart Framing & Overlay Rendering
  useEffect(() => {
    if (!map || !MarkerClass) return

    // 1. Cleanup removed routes
    const activeIds = new Set(selectedRouteIds)
    Object.keys(overlaysRef.current).forEach(id => {
      if (!activeIds.has(id)) {
        overlaysRef.current[id].forEach(o => 'setMap' in o ? o.setMap(null) : o.map = null)
        delete overlaysRef.current[id]
        endpointMarkersRef.current[id].forEach(m => m.map = null)
        delete endpointMarkersRef.current[id]
      }
    })

    const bounds = new google.maps.LatLngBounds()
    let hasGeom = false

    selectedRouteIds.forEach(id => {
      const kml = kmlDataMap[id]
      const buses = busDataMap[id]?.data || []
      const meta = routeMetadata[id]
      if (!kml || !meta) return

      // Redraw/Update overlays for this route
      // We clear and redraw just this route's layers to ensure consistency with real-time data
      if (overlaysRef.current[id]) {
        overlaysRef.current[id].forEach(o => 'setMap' in o ? o.setMap(null) : o.map = null)
      }
      if (endpointMarkersRef.current[id]) {
        endpointMarkersRef.current[id].forEach(m => m.map = null)
      }

      const routeOverlays: (google.maps.Polyline | google.maps.marker.AdvancedMarkerElement)[] = []
      
      // Draw Paths
      Object.entries(kml).forEach(([name, data]) => {
        if (Array.isArray(data)) {
          const isRegreso = name.toLowerCase().includes('regreso')
          const poly = drawPolyline(map, data as KmlCoords, meta.color, isRegreso ? 4 : 6, isRegreso ? 0.6 : 1.0, 10)
          routeOverlays.push(poly)
          data.forEach(c => { bounds.extend(c); hasGeom = true })
        }
      })

      // Draw Endpoints (Mobile Optimized)
      const originMarker = new MarkerClass({
        map, position: meta.inicio, title: `${id}: Inicio`,
        content: (() => {
          const div = document.createElement('div')
          div.style.cssText = `width:10px;height:10px;border-radius:50%;background:#22c55e;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3)`
          return div
        })()
      })
      const destMarker = new MarkerClass({
        map, position: meta.termina, title: `${id}: Fin`,
        content: (() => {
          const div = document.createElement('div')
          div.style.cssText = `width:10px;height:10px;border-radius:50%;background:#ef4444;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3)`
          return div
        })()
      })
      endpointMarkersRef.current[id] = [originMarker, destMarker]

      // Draw Buses
      buses.forEach(bus => {
        const busMarker = new MarkerClass({
          map, position: { lat: bus.latitude, lng: bus.longitude }, zIndex: 100,
          content: createBusMarker(id, meta.color, { 
            busMarker: styles.busMarker, busMarkerIcon: styles.busMarkerIcon, busMarkerLineLabel: styles.busMarkerLineLabel 
          })
        })
        routeOverlays.push(busMarker)
      })

      overlaysRef.current[id] = routeOverlays
    })

    // 2. Smart Frame (only on initial load when geometry is ready)
    if (hasGeom && !hasInitialFit.current) {
      // Ensure we have KML for all selected routes before the first fit
      const allKmlLoaded = selectedRouteIds.every(id => kmlDataMap[id])
      if (allKmlLoaded) {
        map.fitBounds(bounds, { 
          top: 100,     // More padding for search bar
          bottom: 120,  // More padding for bottom tray
          left: 40, 
          right: 40 
        })
        hasInitialFit.current = true
      }
    }
  }, [map, MarkerClass, kmlDataMap, busDataMap, selectedRouteIds])

  const handleSave = () => {
    setIsSaving(true)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedRouteIds))
    setTimeout(() => {
      setIsSaving(false)
      setShowToast(true)
      setTimeout(() => setShowToast(false), 3000)
    }, 400)
  }

  const centerOnUser = () => {
    if (map && userPosition) {
      map.panTo(userPosition)
      if (map.getZoom()! < 15) map.setZoom(15)
    }
  }

  return (
    <div className={styles.mapContainer} style={{ '--vv-height': vvHeight } as React.CSSProperties}>
      <div className={styles.map}>
        <div ref={mapRef} style={{ height: '100%', width: '100%' }} />
      </div>

      {/* Floating Search */}
      <div className={styles.searchContainer}>
        <div className={styles.searchIcon}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); (document.activeElement as HTMLElement)?.blur() }}>
          <input
            type="search"
            inputMode="search"
            enterKeyHint="search"
            className={styles.searchInput}
            placeholder="Busca tu ruta..."
            aria-label="Buscar rutas de autobús"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setIsSearchOpen(true) }}
            onFocus={() => setIsSearchOpen(true)}
          />
        </form>

        
        {isSearchOpen && (
          <div className={styles.searchResults}>
            {filteredRoutes.map(id => (
              <div key={id} className={styles.searchResultItem} onClick={() => toggleRoute(id)}>
                <div className={styles.searchResultBadge} style={{ backgroundColor: routeMetadata[id]?.color }} />
                <div style={{ display: 'flex', flex: 1, justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700 }}>{id}</span>
                  {selectedRouteIds.includes(id) && (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Toast Notification */}
      <div className={`${styles.toast} ${showToast ? styles.toastVisible : ''}`}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="3">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        Rutas guardadas
      </div>

      {/* Center on Me Button */}
      {userPosition && !isSearchOpen && (
        <button 
          className={styles.centerMeButton} 
          onClick={centerOnUser}
          aria-label="Centrar en mi ubicación"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <circle cx="12" cy="12" r="3"></circle>
            <line x1="12" y1="2" x2="12" y2="5"></line>
            <line x1="12" y1="19" x2="12" y2="22"></line>
            <line x1="2" y1="12" x2="5" y2="12"></line>
            <line x1="19" y1="12" x2="22" y2="12"></line>
          </svg>
        </button>
      )}

      {/* Bottom Tray */}
      <div className={`${styles.bottomTray} ${isTrayExpanded ? styles.trayExpanded : styles.trayCollapsed} ${isSearchOpen ? styles.trayHiddenMobile : ''}`}>
        <div className={styles.trayHeader} onClick={() => setIsTrayExpanded(!isTrayExpanded)}>
          <div className={styles.trayHandle} />
          <div className={styles.traySummary}>
            <span className={styles.trayTitle}>
              {selectedRouteIds.length === 0 ? 'Sin rutas seleccionadas' : `${selectedRouteIds.length} Rutas activas`}
            </span>
            <div className={styles.trayLegend}>
              {selectedRouteIds.map(id => (
                <div key={id} className={styles.legendDot} style={{ backgroundColor: routeMetadata[id]?.color }} />
              ))}
            </div>
          </div>
          <svg 
            width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5" 
            style={{ transform: isTrayExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s' }}
          >
            <polyline points="18 15 12 9 6 15"></polyline>
          </svg>
        </div>

        <div className={styles.trayContent}>
          {selectedRouteIds.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: '14px' }}>
              Busca una ruta arriba para comenzar
            </div>
          ) : (
            <>
              {selectedRouteIds.map(id => (
                <div key={id} className={styles.activeRouteItem}>
                  <div className={styles.routeInfo}>
                    <div className={styles.routeBadge} style={{ backgroundColor: routeMetadata[id]?.color }}>{id}</div>
                    <div>
                      <div className={styles.routeName}>{routeMetadata[id]?.name}</div>
                      <div className={styles.routeStatusText}>
                        <span className={`${styles.statusDot} ${busDataMap[id]?.loading ? styles.statusLoading : busDataMap[id]?.error ? styles.statusError : styles.statusOk}`} />
                        {' '}{busDataMap[id]?.loading ? 'Cargando...' : busDataMap[id]?.error ? 'Sin datos' : `${busDataMap[id]?.data.length} autobuses`}
                      </div>
                    </div>
                  </div>
                  <button className={styles.removeButton} onClick={() => toggleRoute(id)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                </div>
              ))}
              <button 
                className={`${styles.saveButton} ${isSaving ? styles.saveButtonPulse : ''}`}
                onClick={handleSave}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                </svg>
                Guardar configuración
              </button>
            </>
          )}
        </div>
      </div>

      {/* Click outside to close search */}
      {isSearchOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={() => setIsSearchOpen(false)} />
      )}

      {/* Author Card (Desktop Overlay) */}
      <div className={styles.authorOverlay}>
        <div className={styles.authorCardCompact}>
          <span className={styles.authorName}>Built by Esau Martinez</span>
          <a href="https://github.com/dinoesau" target="_blank" rel="noopener noreferrer" className={styles.authorLink}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
            </svg>
            GitHub
          </a>
        </div>
      </div>
    </div>
  );
}
