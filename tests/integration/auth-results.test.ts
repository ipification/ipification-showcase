import { test, expect } from "vitest";
import { memoryStore } from "@/shared/server/storage/memory";
import {
  saveResult,
  waitForResult,
  getUserInfo,
} from "@/shared/server/storage/auth-results";
test("results expire in ten minutes and only one concurrent S2S read succeeds", async () => {
  try {
    const value = {
      userInfo: { sub: "fixture" },
      state: "s",
      client_id: "c",
      client_title: "Phone",
    };
    await saveResult("s", value, { sub: "fixture" });
    expect(await waitForResult("s")).toEqual(value);
    const reads = await Promise.all([getUserInfo("s"), getUserInfo("s")]);
    expect(reads.filter(Boolean)).toEqual([{ sub: "fixture" }]);
    expect(await waitForResult("s")).toEqual(value);
    expect(memoryStore.remaining("result:s")).toBeGreaterThan(590000);
    expect(memoryStore.remaining("result:s")).toBeLessThanOrEqual(600000);
    memoryStore.set("result:s-user-info", { sub: "fixture" }, 100);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(await getUserInfo("s")).toBeUndefined();
  } finally {
  }
});
