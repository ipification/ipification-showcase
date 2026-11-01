import { test, expect } from "vitest";
import { startRedis } from "../helpers/redis";
import {
  saveResult,
  waitForResult,
  getUserInfo,
} from "@/server/store/auth-results";
import { closeRedis } from "@/server/store/redis";
test("results are shared, retain one hour TTL and S2S reads do not consume", async () => {
  const redis = await startRedis();
  process.env.REDIS_URL = redis.url;
  process.env.SHOWCASE_KEY_PREFIX = "result-test:";
  try {
    const value = {
      userInfo: { sub: "fixture" },
      state: "s",
      client_id: "c",
      client_title: "Phone",
    };
    await saveResult("s", value, { sub: "fixture" });
    expect(
      JSON.parse((await redis.client.get("result-test:result:s"))!),
    ).toEqual(value);
    expect(await waitForResult("s")).toEqual(value);
    expect(await getUserInfo("s")).toEqual({ sub: "fixture" });
    expect(await getUserInfo("s")).toEqual({ sub: "fixture" });
    expect(await redis.client.pTTL("result-test:result:s")).toBeGreaterThan(
      3590000,
    );
    await redis.client.pExpire("result-test:result:s", 100);
    await redis.client.pExpire("result-test:result:s-user-info", 100);
    await waitForResult("s");
    expect(await redis.client.pTTL("result-test:result:s")).toBeLessThanOrEqual(
      100,
    );
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(await getUserInfo("s")).toBeUndefined();
  } finally {
    await closeRedis();
    await redis.stop();
  }
});
