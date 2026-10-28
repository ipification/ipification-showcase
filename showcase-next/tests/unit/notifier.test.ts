import { test, expect, vi } from "vitest";
const fixture = vi.hoisted(() => ({
  client: {
    isReady: true,
    publish: () => Promise.reject(new Error("PUBLISH_FAILED")),
  },
}));
vi.mock("@/server/store/redis", () => ({
  getRedis: async () => fixture.client,
  key: (s: string) => s,
}));
import { notifyAuthComplete } from "@/server/realtime/notifier";
test("notifier awaits Redis publish failure before callback can return success", async () => {
  await expect(
    notifyAuthComplete("s", "http://showcase/auth/complete?state=s"),
  ).rejects.toThrow("PUBLISH_FAILED");
});
