type CacheEntry<T> = {
  v: 1;
  ts: number;
  data: T;
};

const nowMs = () => Date.now();

const keyFor = (parts: Array<string | number | null | undefined>) =>
  `forest:cache:${parts.filter(Boolean).join(':')}`.slice(0, 512);

const cacheGet = async <T>(
  keyParts: Array<string | number | null | undefined>,
  ttlSeconds: number,
): Promise<T | null> => {
  const key = keyFor(keyParts);
  const items = await chrome.storage.local.get(key);
  const raw = items[key] as CacheEntry<T> | undefined;
  if (!raw || raw.v !== 1) return null;
  if (ttlSeconds <= 0) return null;
  if (nowMs() - raw.ts > ttlSeconds * 1000) return null;
  return raw.data ?? null;
};

const cacheSet = async <T>(keyParts: Array<string | number | null | undefined>, data: T) => {
  const key = keyFor(keyParts);
  const entry: CacheEntry<T> = { v: 1, ts: nowMs(), data };
  await chrome.storage.local.set({ [key]: entry });
};

export { cacheGet, cacheSet };
