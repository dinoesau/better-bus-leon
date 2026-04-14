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
 * Metadata for bus routes A-03, A-75, A-31 and L-03 in León, Guanajuato.
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

  "L-03": {
    name: "Ruta L-03",
    color: "#38A169",
    description: "Terminal San Juan Bosco — Terminal San Jerónimo",
    empresa: "Red Optibus Oriente - Red Integral",
    tipo: "Troncal",
    // KML source: /public/data/L-03.kml
    inicio: { lat: 21.1323685, lng: -101.716218 },
    termina: { lat: 21.1499699, lng: -101.6751369 },
  },
  "L-04": {
    name: "Ruta L-04",
    color: "#097138",
    description: "Terminal San Juan Bosco — Terminal Delta",
    empresa: "Red Optibus Oriente - Red Integral",
    tipo: "Troncal",
    // KML source: /public/data/L-04.kml
    inicio: { lat: 21.132393, lng: -101.71618 },
    termina: { lat: 21.0955648, lng: -101.6185637 },
  },
};

export const mapCenter = { lat: 21.1200, lng: -101.7210 };
export const mapZoom = 13;
