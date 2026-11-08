import { test, expect } from "vitest";
import { memoryStore } from "@/server/store/memory";
import {
  saveResult,
  waitForResult,
  getUserInfo,
} from "@/server/store/auth-results";
test("results are shared, retain one hour TTL and S2S reads do not consume", async () => {
  try {
    const value = {
      userInfo: { sub: "fixture" },
      state: "s",
      client_id: "c",
      client_title: "Phone",
    };
    await saveResult("s", value, { sub: "fixture" });
    expect(await waitForResult("s")).toEqual(value);
    expect(await getUserInfo("s")).toEqual({ sub: "fixture" });
    expect(await getUserInfo("s")).toEqual({ sub: "fixture" });
    expect(memoryStore.remaining("result:s")).toBeGreaterThan(3590000);
    memoryStore.set("result:s-user-info", { sub: "fixture" }, 100);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(await getUserInfo("s")).toBeUndefined();
  } finally {
  }
});
