import { parseCustomPayload } from '@/lib/parseCustomPayload';

const API_URL =
  'http://189.206.79.27/leon/websocket_app_ios/socket_request_android_nvo_13611.php?parametro=OCMzM2E5MmJjNmI0ZDA0YjA4LDEsNywyLDIxLjEyMzkzLC0xMDEuNzMwMzYsMTI3LDIxLjEzNTA0LC0xMDEuNzE3ODQ=';

export async function GET(): Promise<Response> {
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
        headers: {
          'Content-Type': 'application/json',
          'CDN-Cache-Control': 'max-age=60',
        },
      });
    }

    const base64 = (await res.text()).trim();
    const parsed = parseCustomPayload(base64);
    const data = { buses: parsed.namedFilteredData };

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'CDN-Cache-Control': 'max-age=60',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'CDN-Cache-Control': 'max-age=60',
      },
    });
  }
}
