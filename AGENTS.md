<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Developer Commands
- `pnpm dev`: Starts dev server with `--experimental-https`. Requires SSL certs in `certificates/`.
- `pnpm build`: Standard Next.js build.
- `pnpm lint`: Runs ESLint check.

## Environment Variables
- `BUSES_API_BASE`: Base URL for the external bus tracking API.
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`: Key for Google Maps JS API.

## Architecture & Data
- **Real-time Location:** Handled by `app/api/location/route.ts`. It proxies requests to `BUSES_API_BASE` and decodes payloads using `lib/parseCustomPayload.ts`.
- **Route Geometry:** Static KML files in `public/data/` (e.g., `A-03.kml`).
- **Route Metadata:** `data/routes.ts` contains colors, names, and endpoints.
- **Maps:** Uses `@googlemaps/js-api-loader`. Main view is `components/BusMap.tsx`.

## Contextual Quirks
- **Payload Parsing:** The external API returns a custom format that must be decoded by `parseCustomPayload`. Do not assume standard JSON from the upstream source.
- **HTTPS:** Local development *must* use HTTPS for certain browser features (like Geolocation) to work correctly with the map.
