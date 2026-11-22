import { expect, test } from "vitest";
import { authResultStore } from "@/shared/server/storage/auth-results";
import { memoryStore } from "@/shared/server/storage/memory";

test("results expire in ten minutes and only one concurrent S2S read succeeds", async () => {
  const key = "result:s";
  const result = {
    userInfo: { sub: "fixture" },
    state: "s",
    client_id: "c",
    client_title: "Phone",
  };
  try {
    await authResultStore.saveResult("s", result);
    expect(await authResultStore.readDisplayResult("s")).toEqual(result);
    expect(memoryStore.remaining(key)).toBeGreaterThan(590000);
    expect(memoryStore.remaining(key)).toBeLessThanOrEqual(600000);

    const reads = await Promise.all([
      authResultStore.consumeUserInfo("s"),
      authResultStore.consumeUserInfo("s"),
    ]);
    expect(reads.filter(Boolean)).toEqual([result.userInfo]);
    expect(await authResultStore.readDisplayResult("s")).toEqual(result);

    await authResultStore.saveResult("s", result);
    memoryStore.set(key, memoryStore.get(key), 100);
    expect(await authResultStore.consumeUserInfo("s")).toEqual(result.userInfo);
    expect(memoryStore.remaining(key)).toBeLessThanOrEqual(100);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(await authResultStore.readDisplayResult("s")).toBeUndefined();
    expect(await authResultStore.consumeUserInfo("s")).toBeUndefined();
  } finally {
    memoryStore.delete(key);
  }
});
