import type { DisplayResult } from "@/shared/contracts";
import { memoryStore, type MemoryStore } from "./memory";

const RESULT_TTL_MS = 600000;

interface StoredResult {
  display: DisplayResult;
  availableForS2s: boolean;
}

export function createAuthResultStore(
  store: Pick<MemoryStore, "get" | "set" | "remaining">,
) {
  return {
    async saveResult(state: string, display: DisplayResult) {
      store.set(
        "result:" + state,
        { display, availableForS2s: true } satisfies StoredResult,
        RESULT_TTL_MS,
      );
    },
    async readDisplayResult(state: string) {
      return store.get<StoredResult>("result:" + state)?.display;
    },
    async consumeUserInfo(state: string) {
      const key = "result:" + state;
      const result = store.get<StoredResult>(key);
      if (!result?.availableForS2s) return undefined;
      // Keep the claim synchronous and preserve the original expiry.
      result.availableForS2s = false;
      store.set(key, result, store.remaining(key));
      return result.display.userInfo;
    },
  };
}

export const authResultStore = createAuthResultStore(memoryStore);
