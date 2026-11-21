import { test, expect } from "vitest";
import { checkTs43Limit } from "@/server/store/rate-limit";
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
