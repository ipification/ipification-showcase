import { test, expect } from "vitest";
import { createAuthResultStore } from "@/server/store/auth-results";
test("result writes remain sequential and total miss retains five reads and sleeps", async () => {
  const operations: string[] = [];
  const store = createAuthResultStore(
    {
      get: async () => {
        operations.push("read");
        return null;
      },
      set: async (key) => {
        operations.push(key);
      },
    },
    async () => {
      operations.push("sleep");
    },
  );
  await store.saveResult(
    "s",
    { userInfo: {}, state: "s", client_id: "c", client_title: "Phone" },
    {},
  );
  expect(operations).toEqual(["s", "s-user-info"]);
  operations.length = 0;
  expect(await store.waitForResult()).toBeUndefined();
  expect(operations).toEqual(
    Array.from({ length: 5 }, () => ["read", "sleep"]).flat(),
  );
});
