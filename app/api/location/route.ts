import { parseCustomPayload } from '@/lib/parseCustomPayload';
import { ROUTE_API_PARAMS, VALID_ROUTE_IDS } from '@/lib/route-config';

const CACHE_HEADERS = {
  'Content-Type': 'application/json',
  'CDN-Cache-Control': 'max-age=20',
} as const;

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const ruta = searchParams.get('ruta');

  if (!ruta || !VALID_ROUTE_IDS.includes(ruta)) {
    return new Response(
      JSON.stringify({ error: `Invalid route. Valid routes: ${VALID_ROUTE_IDS.join(', ')}` }),
      { status: 400, headers: CACHE_HEADERS },
    );
  }

  const parametro = ROUTE_API_PARAMS[ruta];
  const apiBase = process.env.BUSES_API_BASE;

  if (!apiBase) {
    return new Response(
      JSON.stringify({ error: 'Server configuration error: BUSES_API_BASE not set' }),
      { status: 500, headers: CACHE_HEADERS },
    );
  }

  const apiUrl = `${apiBase}?parametro=${parametro}`;

  try {
    const res = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 15; Pixel 2 Build/AP3A.241105.008)',
        'Connection': 'Keep-Alive',
        'Accept-Encoding': 'identity',
      },
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ error: `HTTP ${res.status}` }), {
        status: 502,
        headers: CACHE_HEADERS,
      });
    }

    const base64 = (await res.text()).trim();
    const parsed = parseCustomPayload(base64);
    const data = { buses: parsed.namedFilteredData };

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: CACHE_HEADERS,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: CACHE_HEADERS,
    });
  }
}
