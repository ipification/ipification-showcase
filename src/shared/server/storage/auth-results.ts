import { memoryStore } from "./memory";
import type { DisplayResult, UserInfo } from "@/shared/contracts";
type Store = {
  get: (key: string) => Promise<DisplayResult | UserInfo | null>;
  set: (key: string, value: DisplayResult | UserInfo) => Promise<unknown>;
};
export function createAuthResultStore(
  store: Store,
  delay: (ms: number) => Promise<void> = (ms) =>
    new Promise((r) => setTimeout(r, ms)),
) {
  return {
    // Keep the display metadata and the provider userinfo separately: the result
    // page reads the former, while the legacy S2S endpoint reads the latter.
    async saveResult(state: unknown, result: DisplayResult, raw: UserInfo) {
      await store.set(String(state), result);
      await store.set(`${state}-user-info`, raw);
    },
    async waitForResult(state?: unknown): Promise<DisplayResult | undefined> {
      for (let i = 0; i <= 4; i++) {
        const value = await store.get(String(state || ""));
        if (value) return value as DisplayResult;
        await delay(1000);
      }
      return undefined;
    },
    async getUserInfo(state?: unknown): Promise<UserInfo | undefined> {
      return ((await store.get(`${state}-user-info`)) as UserInfo) || undefined;
    },
  };
}
const store = createAuthResultStore({
  async get(id) {
    return memoryStore.get<DisplayResult | UserInfo>("result:" + id) ?? null;
  },
  async set(id, value) {
    memoryStore.set("result:" + id, value, 3600000);
  },
});
export const { saveResult, waitForResult, getUserInfo } = store;
