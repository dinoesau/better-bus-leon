import { routes } from "@/data/routes";

export default function JsonLd() {
  const transitLines = Object.entries(routes).map(([id, route]) => ({
    "@type": "TransitLine",
    "name": route.name,
    "description": route.description,
    "identifier": id,
    "transitServiceType": "Bus",
    "provider": {
      "@type": "Organization",
      "name": route.empresa,
    },
    "itinerary": [
      {
        "@type": "TransitStop",
        "name": `Inicio: ${route.description.split(" — ")[0] || "Inicio"}`,
        "geo": {
          "@type": "GeoCoordinates",
          "latitude": route.inicio.lat,
          "longitude": route.inicio.lng
        }
      },
      {
        "@type": "TransitStop",
        "name": `Fin: ${route.description.split(" — ")[1] || "Fin"}`,
        "geo": {
          "@type": "GeoCoordinates",
          "latitude": route.termina.lat,
          "longitude": route.termina.lng
        }
      }
    ],
    "areaServed": {
      "@type": "City",
      "name": "León",
      "address": {
        "@type": "PostalAddress",
        "addressLocality": "León",
        "addressRegion": "Guanajuato",
        "addressCountry": "MX"
      }
    }
  }));

  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        "name": "Better Bus León",
        "description": "Monitoreo en tiempo real de rutas de autobús en León, Guanajuato.",
        "url": "https://bus.esau.com.mx",
        "applicationCategory": "TravelApplication",
        "operatingSystem": "All",
        "author": {
          "@type": "Person",
          "name": "Esau Martinez",
          "url": "https://github.com/dinoesau"
        }
      },
      {
        "@type": "TransitSystem",
        "name": "Sistema Integrado de Transporte (SIT) León",
        "areaServed": {
          "@type": "City",
          "name": "León"
        },
        "hasPart": transitLines
      }
    ]
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
