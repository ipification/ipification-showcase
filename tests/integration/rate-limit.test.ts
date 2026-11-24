import { test, expect } from "vitest";
import {
  checkTs43Limit,
  checkAuthLimit,
} from "@/shared/server/storage/rate-limit";
test("SMS attempts are limited atomically and isolated from other operations", async () => {
  const input = { client_id: "test-rate-client", login_hint: "+12025550123" };
  const results = await Promise.all(
    Array.from({ length: 6 }, () =>
      checkAuthLimit("sms-auth", { clientIp: "192.0.2.15" }, input),
    ),
  );
  expect(results.filter((r) => r.allowed)).toHaveLength(5);
  expect(results[5].headers["Retry-After"]).toBeDefined();
  expect(
    (await checkAuthLimit("sms-token", { clientIp: "192.0.2.15" }, input))
      .allowed,
  ).toBe(true);
});
test("SMS phone limit cannot be bypassed by format, client or IP", async () => {
  for (let i = 0; i < 5; i++) {
    expect(
      (
        await checkAuthLimit(
          "sms-auth",
          { clientIp: `198.51.100.${i}` },
          { client_id: `client-${i}`, login_hint: "+44 (7700) 900123" },
        )
      ).allowed,
    ).toBe(true);
  }
  expect(
    (
      await checkAuthLimit(
        "sms-auth",
        { clientIp: "198.51.100.20" },
        { client_id: "another-client", login_hint: "447700900123" },
      )
    ).allowed,
  ).toBe(false);
});
test("identity limit has shared atomic count and Retry-After", async () => {
  try {
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        checkTs43Limit(
          { clientIp: "203.0.113.1" },
          { client_id: "c", login_hint: "phone" },
        ),
      ),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
    expect(
      results.find((r) => !r.allowed)?.headers["Retry-After"],
    ).toBeDefined();
  } finally {
  }
});
