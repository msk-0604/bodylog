import { secureSessionStorage } from '../secureStorage';

// jest.mock is hoisted above the import by babel-jest.
const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (k: string) => mockStore.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => {
    if (v.length > 2048) throw new Error('value too large');
    mockStore.set(k, v);
  },
  deleteItemAsync: async (k: string) => {
    mockStore.delete(k);
  },
}));

beforeEach(() => mockStore.clear());

describe('secureSessionStorage', () => {
  it('stores long sessions in chunks and reads them back', async () => {
    const value = 'x'.repeat(5000);
    await secureSessionStorage.setItem('sb-auth', value);
    expect(await secureSessionStorage.getItem('sb-auth')).toBe(value);
    expect(mockStore.get('sb-auth.chunks')).toBe('3');
  });

  it('removes stale chunks when the value shrinks and on removeItem', async () => {
    await secureSessionStorage.setItem('k', 'y'.repeat(5000));
    await secureSessionStorage.setItem('k', 'short');
    expect(mockStore.has('k.1')).toBe(false);
    expect(await secureSessionStorage.getItem('k')).toBe('short');
    await secureSessionStorage.removeItem('k');
    expect(mockStore.size).toBe(0);
    expect(await secureSessionStorage.getItem('k')).toBeNull();
  });
});
