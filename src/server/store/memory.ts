import { TTLCache } from "@isaacs/ttlcache";

// Demo-only, process-local storage. Multi-instance applications need a shared store.
export class MemoryStore {
  private cache: TTLCache<string, unknown>;
  constructor(private readonly max = 10000) {
    this.cache = new TTLCache({ max, ttl: 3600000, checkAgeOnGet: true });
  }
  get<T>(key: string): T | undefined {
    const value = this.cache.get(key);
    return value === undefined ? undefined : (structuredClone(value) as T);
  }
  set(key: string, value: unknown, ttl: number): void {
    if (ttl <= 0) {
      this.cache.delete(key);
      return;
    }
    this.cache.purgeStale();
    if (!this.cache.has(key) && this.cache.size >= this.max)
      throw new Error("STORE_CAPACITY");
    this.cache.set(key, structuredClone(value), { ttl: Math.ceil(ttl) });
  }
  remaining(key: string): number {
    return this.cache.getRemainingTTL(key);
  }
  delete(key: string): void {
    this.cache.delete(key);
  }
}
const globalStore = globalThis as typeof globalThis & {
  __showcaseMemoryStore?: MemoryStore;
};
export const memoryStore = (globalStore.__showcaseMemoryStore ??=
  new MemoryStore());
