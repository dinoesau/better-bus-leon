import { ROUTE_API_PARAMS } from '@/lib/route-config';
import { parseCustomPayload, ParsedResult } from '@/lib/parseCustomPayload';
import { ValidRouteId } from '../domain/bus-route';
import { Result } from '../core/result';
import { env } from '../core/env';
import { assert } from '../core/assert';

/**
 * Core Service: Fetches bus locations for a trusted Route ID.
 * This function is "offensive" - it assumes the environment is configured correctly.
 */
export async function fetchBusLocations(routeId: ValidRouteId): Promise<Result<ParsedResult['namedFilteredData'], Error>> {
  const parametro = ROUTE_API_PARAMS[routeId];
  
  // Rule 4: Offensive Assertion
  // Since routeId is branded, missing config is a system bug.
  assert(parametro, `Critical Config Error: No API parameter mapping found for route ${routeId}`);

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

    // Rule 1: Validation at the Edge
    if (!base64) {
      return { 
        ok: false, 
        error: new Error('Empty response from upstream API') 
      };
    }

    // Rule 3: Parse, Don't Validate
    const parseResult = parseCustomPayload(base64);
    
    if (!parseResult.ok) {
      return parseResult;
    }
    
    return { ok: true, value: parseResult.value.namedFilteredData };
  } catch (err) {
    return { 
      ok: false, 
      error: err instanceof Error ? err : new Error(String(err)) 
    };
  }
}
