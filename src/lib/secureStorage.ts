import * as SecureStore from 'expo-secure-store';

/**
 * Storage adapter for the Supabase auth session backed by the OS keychain/keystore.
 * SecureStore values should stay small (~2 KB), so long values are split into chunks.
 */
const CHUNK = 1800;

const countKey = (key: string) => `${key}.chunks`;
const chunkKey = (key: string, i: number) => `${key}.${i}`;

async function readCount(key: string): Promise<number> {
  const n = Number(await SecureStore.getItemAsync(countKey(key)));
  return Number.isInteger(n) && n > 0 ? n : 0;
}

export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    const n = await readCount(key);
    if (n === 0) return null;
    const parts: string[] = [];
    for (let i = 0; i < n; i++) {
      const part = await SecureStore.getItemAsync(chunkKey(key, i));
      if (part === null) return null;
      parts.push(part);
    }
    return parts.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    const old = await readCount(key);
    const n = Math.max(1, Math.ceil(value.length / CHUNK));
    for (let i = 0; i < n; i++) {
      await SecureStore.setItemAsync(chunkKey(key, i), value.slice(i * CHUNK, (i + 1) * CHUNK));
    }
    await SecureStore.setItemAsync(countKey(key), String(n));
    for (let i = n; i < old; i++) await SecureStore.deleteItemAsync(chunkKey(key, i));
  },

  async removeItem(key: string): Promise<void> {
    const n = await readCount(key);
    for (let i = 0; i < n; i++) await SecureStore.deleteItemAsync(chunkKey(key, i));
    await SecureStore.deleteItemAsync(countKey(key));
  },
};
