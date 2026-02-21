import { cacheGet, cacheSet } from '../../pages/renderer/src/cache';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

type LocalStore = Record<string, unknown>;

const createChromeStorageStub = (store: LocalStore) => ({
  storage: {
    local: {
      get: async (key: string) => ({ [key]: store[key] }),
      set: async (items: Record<string, unknown>) => {
        Object.assign(store, items);
      },
    },
  },
});

test('cacheGet/cacheSet roundtrip within TTL', async () => {
  const store: LocalStore = {};
  globalThis.chrome = createChromeStorageStub(store);

  await cacheSet(['k', 1], { ok: true });
  const value = await cacheGet<{ ok: boolean }>(['k', 1], 60);
  assert.deepEqual(value, { ok: true });
});

test('cacheGet returns null when expired', async () => {
  const store: LocalStore = {};
  globalThis.chrome = createChromeStorageStub(store);

  await cacheSet(['k', 2], { ok: true });

  const key = Object.keys(store)[0]!;
  const entry = store[key] as { v: 1; ts: number; data: unknown };
  entry.ts = 0;
  store[key] = entry;

  const value = await cacheGet(['k', 2], 1);
  assert.equal(value, null);
});
