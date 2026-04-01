export const dynamic = 'force-dynamic';

import { parseCustomPayload } from '@/lib/parseCustomPayload';

const API_URL =
  'http://189.206.79.27/leon/websocket_app_ios/socket_request_android_nvo_13611.php?parametro=OCMzM2E5MmJjNmI0ZDA0YjA4LDEsNywyLDIxLjEyMzkzLC0xMDEuNzMwMzYsMTI3LDIxLjEzNTA0LC0xMDEuNzE3ODQ=';

export async function GET(): Promise<Response> {
  if (!API_URL) {
    return new Response(JSON.stringify({ error: 'API_URL not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const res = await fetch(API_URL, {
      headers: {
        'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 15; Pixel 2 Build/AP3A.241105.008)',
        'Connection': 'Keep-Alive',
        'Accept-Encoding': 'identity',
      },
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ error: `HTTP ${res.status}` }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const base64 = (await res.text()).trim();
    const parsed = parseCustomPayload(base64);

    return new Response(JSON.stringify({ buses: parsed.namedFilteredData }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
