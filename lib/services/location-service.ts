import { ROUTE_API_PARAMS } from '@/lib/route-config';
import { parseCustomPayload, ParsedResult } from '@/lib/parseCustomPayload';
import { ValidRouteId } from '../domain/bus-route';
import { Result } from '../core/result';
import { env } from '../core/env';

/**
 * Core Service: Fetches bus locations for a trusted Route ID.
 * This function is "offensive" - it assumes the environment is configured correctly.
 */
export async function fetchBusLocations(routeId: ValidRouteId): Promise<Result<ParsedResult['namedFilteredData'], Error>> {
  const parametro = ROUTE_API_PARAMS[routeId];
  const apiUrl = `${env.BUSES_API_BASE}?parametro=${parametro}`;

  try {
    const res = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 15; Pixel 2 Build/AP3A.241105.008)',
        'Connection': 'Keep-Alive',
        'Accept-Encoding': 'identity',
      },
    });

    if (!res.ok) {
      return { 
        ok: false, 
        error: new Error(`Upstream API failure (HTTP ${res.status})`) 
      };
    }

    const base64 = (await res.text()).trim();
    const parsed = parseCustomPayload(base64);
    
    return { ok: true, value: parsed.namedFilteredData };
  } catch (err) {
    return { 
      ok: false, 
      error: err instanceof Error ? err : new Error(String(err)) 
    };
  }
}
