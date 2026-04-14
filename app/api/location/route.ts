import { parseLocationRequest } from '@/lib/domain/bus-route';
import { fetchBusLocations } from '@/lib/services/location-service';

const CACHE_HEADERS = {
  'Content-Type': 'application/json',
  'CDN-Cache-Control': 'max-age=20',
} as const;

/**
 * The Edge: Acts as the Bouncer (validation) and maps results to HTTP responses.
 */
export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);

  // 1. Validation (Defensive - The Bouncer)
  // We transform untrusted input into a Branded Type.
  // parseLocationRequest is strict: no duplicates, no extra params.
  const routeResult = parseLocationRequest(searchParams);
  
  if (!routeResult.ok) {
    return new Response(
      JSON.stringify({ error: routeResult.error }),
      { status: 400, headers: CACHE_HEADERS }
    );
  }

  // 2. Core Execution (Trusting the Branded Type)
  // The service only accepts ValidRouteId, so no re-validation is needed.
  const locationResult = await fetchBusLocations(routeResult.value);

  // 3. Graceful Error Mapping
  if (!locationResult.ok) {
    // If it's a fetch/upstream error, we return 502 (Bad Gateway)
    // If it's a configuration error (thrown by assertion), it naturally becomes 500.
    return new Response(
      JSON.stringify({ error: locationResult.error.message }),
      { status: 502, headers: CACHE_HEADERS }
    );
  }

  // 4. Success Response
  return new Response(
    JSON.stringify({ buses: locationResult.value }),
    { status: 200, headers: CACHE_HEADERS }
  );
}
