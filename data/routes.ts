/**
 * Datos de rutas de autobús.
 * Coordenadas en formato { lat, lng }
 *
 * Para actualizar las rutas, reemplaza los arrays de `coordinates`
 * con los datos reales obtenidos del parser.js (columnas lat/lng).
 *
 * Zona: León, Guanajuato, México
 */

/**
 * Metadata for bus routes A-03, A-75 and A-31 in León, Guanajuato.
 * Actual route geometry is loaded at runtime from /public/data/*.kml
 */

export interface BusRoute {
  name: string;
  color: string;
  description: string;
  empresa: string;
  tipo: string;
  inicio: { lat: number; lng: number };
  termina: { lat: number; lng: number };
}

export const routes: Record<string, BusRoute> = {
  "A-03": {
    name: "Ruta A-03",
    color: "#E53E3E",
    description: "Colonia Las Hilamas — Terminal San Juan Bosco",
    empresa: "Bellavista",
    tipo: "Alimentadora",
    // KML source: /public/data/A-03.kml
    inicio: { lat: 21.103463, lng: -101.728152 },  // Colonia Las Hilamas
    termina: { lat: 21.131907, lng: -101.716055 },  // Terminal San Juan Bosco
  },

  "A-75": {
    name: "Ruta A-75",
    color: "#2B6CB0",
    description: "Terminal San Juan Bosco — Colonia Rizos del Saucillo III",
    empresa: "Garita",
    tipo: "Alimentadora",
    // KML source: /public/data/A-75.kml
    inicio: { lat: 21.132054, lng: -101.716057 },  // Terminal San Juan Bosco
    termina: { lat: 21.146437, lng: -101.763561 },  // Colonia Rizos del Saucillo III
  },

  "A-31": {
    name: "Ruta A-31",
    color: "#D69E2E",
    description: "Terminal San Juan Bosco — Colinas de la Fragua Plus II",
    empresa: "San Juan Bosco",
    tipo: "Alimentadora",
    // KML source: /public/data/A-31.kml
    inicio: { lat: 21.131913, lng: -101.716057 },
    termina: { lat: 21.153457, lng: -101.743316 },
  },
};

export const mapCenter = { lat: 21.1200, lng: -101.7210 };
export const mapZoom = 13;
