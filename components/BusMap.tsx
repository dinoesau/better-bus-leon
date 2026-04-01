'use client'

import { useEffect, useRef } from 'react'
import { setOptions, importLibrary } from '@googlemaps/js-api-loader'
import { routes } from '@/data/routes'
import styles from './BusMap.module.css'

const ORIGIN = { lat: 21.123232, lng: -101.731127 }
const DESTINATION = { lat: 21.13129, lng: -101.71705 }

const ALLOWED_LINES = ['A-03', 'A-75'] as const
const ROUTE_COLORS: Record<string, string> = { 'A-03': '#E53E3E', 'A-75': '#2B6CB0' }

// --- KML utilities ---

function parseKmlCoords(text: string) {
  return text
    .trim()
    .split(/\s+/)
    .map((c) => {
      const parts = c.split(',')
      return { lat: parseFloat(parts[1]), lng: parseFloat(parts[0]) }
    })
    .filter((c) => !isNaN(c.lat) && !isNaN(c.lng))
}

async function loadRouteKml(routeId: string) {
  const res = await fetch(`/data/${routeId}.kml`)
  const text = await res.text()
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  const out: Record<string, any> = {}
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

function nearestIdx(coords: { lat: number; lng: number }[], lat: number, lng: number) {
  let best = 0
  let bestDist = Infinity
  coords.forEach((c, i) => {
    const d = (c.lat - lat) ** 2 + (c.lng - lng) ** 2
    if (d < bestDist) {
      bestDist = d
      best = i
    }
  })
  return best
}

function detectDirection(
  kml: Record<string, any>,
  lineName: string,
  boardingLat: number,
  boardingLng: number,
  alightingLat: number,
  alightingLng: number,
) {
  for (const suffix of ['ida', 'regreso']) {
    const coords = kml[`${lineName}-${suffix}`]
    if (!coords || coords.length < 2) continue
    const bIdx = nearestIdx(coords, boardingLat, boardingLng)
    const aIdx = nearestIdx(coords, alightingLat, alightingLng)
    if (aIdx > bIdx) return { coords, boardingIdx: bIdx, alightingIdx: aIdx }
  }
  return null
}

function drawPolyline(
  map: google.maps.Map,
  path: google.maps.LatLngLiteral[],
  color: string,
  weight: number,
  opacity: number,
  zIndex: number,
) {
  return new google.maps.Polyline({
    map,
    path,
    strokeColor: color,
    strokeWeight: weight,
    strokeOpacity: opacity,
    zIndex,
  })
}

export default function BusMap() {
  const mapRef = useRef<HTMLDivElement>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    let cancelled = false

    async function initMap() {
      setOptions({
        key: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
        v: 'weekly',
      })

      const { Map } = await importLibrary('maps') as google.maps.MapsLibrary
      const { AdvancedMarkerElement } = await importLibrary('marker') as google.maps.MarkerLibrary

      if (cancelled || !mapRef.current) return

      const map = new Map(mapRef.current, {
        center: {
          lat: (ORIGIN.lat + DESTINATION.lat) / 2,
          lng: (ORIGIN.lng + DESTINATION.lng) / 2,
        },
        zoom: 14,
        mapId: 'bus-routes-map',
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
      })

      // User origin marker (green)
      const originEl = document.createElement('div')
      originEl.style.cssText =
        'width:14px;height:14px;border-radius:50%;background:#22C55E;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);'
      new AdvancedMarkerElement({ map, position: ORIGIN, content: originEl, title: 'Tu origen' })

      // User destination marker (red)
      const destEl = document.createElement('div')
      destEl.style.cssText =
        'width:14px;height:14px;border-radius:50%;background:#EF4444;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);'
      new AdvancedMarkerElement({
        map,
        position: DESTINATION,
        content: destEl,
        title: 'Tu destino',
      })

      // --- Live bus location helper ---
      async function fetchBusLocations({
        apiPath,
        label,
        color,
        markerText,
        statusEl,
      }: {
        apiPath: string
        label: string
        color: string
        markerText: string
        statusEl: HTMLElement | null
      }) {
        if (!statusEl) return
        const dot = statusEl.querySelector('.status-dot') as HTMLElement | null
        const lbl = statusEl.querySelector('.status-label') as HTMLElement | null
        if (!dot || !lbl) return

        try {
          const res = await fetch(apiPath)
          const json = await res.json()
          if (!res.ok || json.error) throw new Error(json.error || 'error')

          const buses = json.buses
          if (buses && buses.length > 0) {
            buses.forEach((bus: { id: string; latitude: number; longitude: number; hora: string }) => {
              const busEl = document.createElement('div')
              busEl.style.cssText = `
                width:28px;height:28px;border-radius:6px;
                background:${color};border:2px solid white;
                box-shadow:0 2px 8px rgba(0,0,0,0.5);
                display:flex;align-items:center;justify-content:center;
                color:white;font-size:9px;font-weight:800;letter-spacing:-0.5px;
              `
              busEl.textContent = markerText
              new AdvancedMarkerElement({
                map,
                position: { lat: bus.latitude, lng: bus.longitude },
                content: busEl,
                title: `${label} · ID: ${bus.id} · ${bus.hora}`,
              })
            })
            dot.className = `${styles.statusDot} ${styles.statusOk}`
            lbl.textContent = `${label} · ${buses.length} unidad${buses.length > 1 ? 'es' : ''} encontrada${buses.length > 1 ? 's' : ''}`
          } else {
            dot.className = `${styles.statusDot} ${styles.statusOk}`
            lbl.textContent = `${label} · sin unidades activas`
          }
        } catch {
          dot.className = `${styles.statusDot} ${styles.statusError}`
          lbl.textContent = `${label} · sin datos`
        }
      }

      fetchBusLocations({
        apiPath: '/api/a03-location',
        label: 'A-03',
        color: '#E53E3E',
        markerText: 'A03',
        statusEl: document.getElementById('status-a03'),
      })

      fetchBusLocations({
        apiPath: '/api/a75-location',
        label: 'A-75',
        color: '#2B6CB0',
        markerText: 'A75',
        statusEl: document.getElementById('status-a75'),
      })

      // Preload KML for both routes
      const kmlData: Record<string, any> = {}
      await Promise.all(
        ALLOWED_LINES.map(async (id) => {
          kmlData[id] = await loadRouteKml(id)
        }),
      )

      const directionsService = new google.maps.DirectionsService()
      const routesList = document.getElementById('routes-list')
      if (!routesList) return

      directionsService.route(
        {
          origin: ORIGIN,
          destination: DESTINATION,
          travelMode: google.maps.TravelMode.TRANSIT,
          provideRouteAlternatives: true,
          transitOptions: {
            modes: [google.maps.TransitMode.BUS],
            routingPreference: google.maps.TransitRoutePreference.FEWER_TRANSFERS,
          },
        },
        (result, status) => {
          routesList.innerHTML = ''

          if (status !== 'OK' || !result) {
            routesList.innerHTML = `<p class="${styles.errorText}">No se encontraron rutas (${status})</p>`
            return
          }

          const directRoutes = result.routes.filter((route) => {
            const transitSteps = route.legs[0].steps.filter(
              (s) => s.travel_mode === google.maps.TravelMode.TRANSIT,
            )
            if (transitSteps.length !== 1) return false
            const lineName =
              transitSteps[0].transit?.line.short_name ||
              transitSteps[0].transit?.line.name ||
              ''
            return ALLOWED_LINES.includes(lineName as any)
          })

          if (directRoutes.length === 0) {
            routesList.innerHTML = `<p class="${styles.errorText}">No se encontraron rutas A-03 o A-75 directas entre estos puntos.</p>`
            return
          }

          const routePolylines: google.maps.Polyline[][] = []

          directRoutes.forEach((route, idx) => {
            const legs = route.legs[0]
            const transitStep = legs.steps.find(
              (s) => s.travel_mode === google.maps.TravelMode.TRANSIT,
            )!
            const lineName =
              transitStep.transit?.line.short_name || transitStep.transit?.line.name || ''
            const color = ROUTE_COLORS[lineName] || '#555'

            const boardingLat = transitStep.transit!.departure_stop.location.lat()
            const boardingLng = transitStep.transit!.departure_stop.location.lng()
            const alightingLat = transitStep.transit!.arrival_stop.location.lat()
            const alightingLng = transitStep.transit!.arrival_stop.location.lng()

            const kml = kmlData[lineName]
            const polylines: google.maps.Polyline[] = []
            const direction = kml
              ? detectDirection(kml, lineName, boardingLat, boardingLng, alightingLat, alightingLng)
              : null

            if (direction) {
              const { coords, boardingIdx, alightingIdx } = direction

              if (boardingIdx > 0) {
                polylines.push(
                  drawPolyline(map, coords.slice(0, boardingIdx + 1), color, 4, 0.3, 5),
                )
              }

              polylines.push(
                drawPolyline(map, coords.slice(boardingIdx, alightingIdx + 1), color, 6, 1, 10),
              )

              if (idx === 0) {
                const bounds = new google.maps.LatLngBounds()
                coords.slice(0, alightingIdx + 1).forEach((c: google.maps.LatLngLiteral) => bounds.extend(c))
                map.fitBounds(bounds, 60)
              }
            }

            routePolylines.push(polylines)

            // Boarding stop marker
            const boardingEl = document.createElement('div')
            boardingEl.style.cssText = `width:11px;height:11px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.35);`
            new AdvancedMarkerElement({
              map,
              position: { lat: boardingLat, lng: boardingLng },
              content: boardingEl,
              title: `Abordas: ${transitStep.transit!.departure_stop.name}`,
            })

            // Alighting stop marker
            const alightEl = document.createElement('div')
            alightEl.style.cssText = `width:11px;height:11px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.35);`
            new AdvancedMarkerElement({
              map,
              position: { lat: alightingLat, lng: alightingLng },
              content: alightEl,
              title: `Bajas: ${transitStep.transit!.arrival_stop.name}`,
            })

            // --- Sidebar card ---
            const transitSteps = legs.steps.filter(
              (s) => s.travel_mode === google.maps.TravelMode.TRANSIT,
            )

            const lines = transitSteps
              .map((s) => {
                const t = s.transit!
                return `<span class="${styles.lineBadge}" style="background:${t.line.color || color};color:${t.line.text_color || '#fff'}">${t.line.short_name || t.line.name}</span>`
              })
              .join('')

            const stopsHTML = legs.steps
              .map((step) => {
                if (step.travel_mode === google.maps.TravelMode.WALKING) {
                  return `<div class="${styles.step} ${styles.walkStep}">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M13 4a1 1 0 1 0 2 0 1 1 0 0 0-2 0"/><path d="m7 20 2-8 3 3 2-5 3 5"/><path d="m11 12-1-4 4 1"/></svg>
                    <span>${step.duration!.text} a pie · ${step.distance!.text}</span>
                  </div>`
                }
                const t = step.transit!
                return `<div class="${styles.step} ${styles.transitStep}">
                  <span class="${styles.stepBadge}" style="background:${t.line.color || color};color:${t.line.text_color || '#fff'}">${t.line.short_name || t.line.name}</span>
                  <div class="${styles.stepDetail}">
                    <strong>${t.departure_stop.name}</strong>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                    <strong>${t.arrival_stop.name}</strong>
                    <small>${t.num_stops} paradas · ${step.duration!.text}</small>
                  </div>
                </div>`
              })
              .join('')

            const card = document.createElement('div')
            card.className = styles.routeCard
            card.dataset.idx = String(idx)
            card.innerHTML = `
              <div class="${styles.cardHeader}">
                <div class="${styles.cardTitle}">
                  <span class="${styles.routeNum}">${idx + 1}</span>
                  <div class="${styles.cardMeta}">
                    <div class="${styles.linesRow}">${lines || `<span class="${styles.noTransit}">Solo a pie</span>`}</div>
                    <div class="${styles.cardSummary}">
                      <strong>${legs.duration!.text}</strong>
                      <span>·</span>
                      <span>${legs.distance!.text}</span>
                      <span>·</span>
                      <span>${legs.departure_time?.text || ''} → ${legs.arrival_time?.text || ''}</span>
                    </div>
                  </div>
                </div>
                <button class="${styles.toggleCard}" data-idx="${idx}" data-open="false">▶</button>
              </div>
              <div class="${styles.cardSteps}" id="steps-${idx}" style="display:none">${stopsHTML}</div>
            `
            routesList.appendChild(card)

            const toggleBtn = card.querySelector(`.${styles.toggleCard}`) as HTMLButtonElement
            toggleBtn.addEventListener('click', (e) => {
              const btn = e.currentTarget as HTMLButtonElement
              const open = btn.dataset.open === 'true'
              const stepsEl = document.getElementById(`steps-${idx}`)
              if (stepsEl) stepsEl.style.display = open ? 'none' : 'block'
              btn.dataset.open = String(!open)
              btn.textContent = open ? '▶' : '▼'
            })

            card.addEventListener('click', (e) => {
              if ((e.target as HTMLElement).closest(`.${styles.toggleCard}`)) return
              document
                .querySelectorAll(`.${styles.routeCard}`)
                .forEach((c) => c.classList.remove(styles.selected))
              card.classList.add(styles.selected)
              routePolylines.forEach((pls, i) => {
                pls.forEach((pl) => {
                  const isActive = i === idx
                  pl.setOptions({
                    strokeOpacity: isActive ? (pl.get('strokeOpacity') > 0.5 ? 1 : 0.3) : 0.15,
                  })
                })
              })
            })
          })
        },
      )
    }

    initMap()

    return () => {
      cancelled = true
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [])

  return (
    <div className={styles.mapContainer}>
      <div ref={mapRef} className={styles.map} style={{ height: '100%', width: '100%' }} />
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <div className={styles.panelCoords}>
            <div className={styles.coordRow}>
              <span className={`${styles.coordDot} ${styles.originDot}`} />
              <span>
                {ORIGIN.lat}, {ORIGIN.lng}
              </span>
            </div>
            <div className={styles.coordDivider} />
            <div className={styles.coordRow}>
              <span className={`${styles.coordDot} ${styles.destDot}`} />
              <span>
                {DESTINATION.lat}, {DESTINATION.lng}
              </span>
            </div>
          </div>
          <div className={styles.busStatus}>
            <div className={styles.routeStatus} id="status-a03">
              <span className={`${styles.statusDot} ${styles.statusLoading}`} />
              <span className="status-label">A-03 en tiempo real...</span>
            </div>
            <div className={styles.routeStatus} id="status-a75">
              <span className={`${styles.statusDot} ${styles.statusLoading}`} />
              <span className="status-label">A-75 en tiempo real...</span>
            </div>
          </div>
        </div>
        <div id="routes-list" className={styles.routesList}>
          <p className={styles.loadingText}>Buscando rutas de transporte...</p>
        </div>
      </div>
    </div>
  )
}
