import { expect, test } from "vitest";
import { MemoryStore } from "@/server/store/memory";

test("memory store enforces expiry and rejects new keys when full", async () => {
  const store = new MemoryStore(1);
  store.set("first", { value: 1 }, 30);
  expect(store.get("first")).toEqual({ value: 1 });
  expect(() => store.set("second", 2, 100)).toThrow("STORE_CAPACITY");
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(store.get("first")).toBeUndefined();
  store.set("second", 2, 100);
  expect(store.get("second")).toBe(2);
});
