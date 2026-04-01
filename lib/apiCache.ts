interface CacheEntry {
  data: unknown;
  windowKey: string;
}

const cache = new Map<string, CacheEntry>();

function getWindowKey(): string {
  const now = new Date();
  const seconds = now.getSeconds();
  const windowSecond = Math.floor(seconds / 30) * 30;
  const date = new Date(now);
  date.setSeconds(windowSecond, 0);
  return date.toISOString();
}

export function getCachedResponse(key: string): unknown | null {
  const currentWindow = getWindowKey();
  const entry = cache.get(key);
  if (entry && entry.windowKey === currentWindow) {
    console.log(`[Cache HIT] ${key}`);
    return entry.data;
  }
  console.log(`[Cache MISS] ${key}`);
  return null;
}

export function setCachedResponse(key: string, data: unknown): void {
  cache.set(key, {
    data,
    windowKey: getWindowKey(),
  });
}
