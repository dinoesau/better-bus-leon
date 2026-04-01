const MARKER_SIZE = 14
const STOP_MARKER_SIZE = 11
const BORDER_SIZE = 2
const SHADOW = '0 2px 6px rgba(0,0,0,0.4)'
const STOP_SHADOW = '0 1px 4px rgba(0,0,0,0.35)'

function applyBaseStyles(el: HTMLElement, size: number, bg: string, borderWidth: number, shadow: string) {
  el.style.width = `${size}px`
  el.style.height = `${size}px`
  el.style.borderRadius = '50%'
  el.style.background = bg
  el.style.border = `${borderWidth}px solid white`
  el.style.boxShadow = shadow
}

export function createOriginMarker(): HTMLDivElement {
  const el = document.createElement('div')
  applyBaseStyles(el, MARKER_SIZE, '#22C55E', BORDER_SIZE, SHADOW)
  return el
}

export function createDestinationMarker(): HTMLDivElement {
  const el = document.createElement('div')
  applyBaseStyles(el, MARKER_SIZE, '#EF4444', BORDER_SIZE, SHADOW)
  return el
}

export function createStopMarker(color: string): HTMLDivElement {
  const el = document.createElement('div')
  applyBaseStyles(el, STOP_MARKER_SIZE, color, BORDER_SIZE, STOP_SHADOW)
  return el
}

interface BusMarkerClassNames {
  busMarker: string
  busMarkerIcon: string
  busMarkerLineLabel: string
}

export function createBusMarker(lineName: string, color: string, classNames: BusMarkerClassNames): HTMLDivElement {
  const el = document.createElement('div')
  el.className = classNames.busMarker
  el.style.setProperty('--route-color', color)

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('class', classNames.busMarkerIcon)
  svg.setAttribute('viewBox', '0 0 24 24')

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', 'M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zM15.5 5H19v5h-3.5V5zM5 5h3.5v5H5V5zM12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z')
  svg.appendChild(path)
  el.appendChild(svg)

  const label = document.createElement('div')
  label.className = classNames.busMarkerLineLabel
  label.textContent = lineName
  el.appendChild(label)

  return el
}
