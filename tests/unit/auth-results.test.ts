import { expect, test } from "vitest";
import { createAuthResultStore } from "@/shared/server/storage/auth-results";
import { MemoryStore } from "@/shared/server/storage/memory";

const display = {
  userInfo: { sub: "fixture" },
  state: "s",
  client_id: "c",
  client_title: "Phone",
};

function setup() {
  const memory = new MemoryStore(1);
  const results = createAuthResultStore(memory);
  return { memory, results };
}

test("one free cache slot fits both result views and S2S consumption preserves display", async () => {
  const { results } = setup();
  await results.saveResult("s", display);
  expect(await results.readDisplayResult("s")).toEqual(display);
  expect(await results.consumeUserInfo("s")).toEqual(display.userInfo);
  expect(await results.consumeUserInfo("s")).toBeUndefined();
  expect(await results.readDisplayResult("s")).toEqual(display);
});

test("a rejected result write leaves neither view in a full cache", async () => {
  const { memory, results } = setup();
  memory.set("other", true, 600000);
  await expect(results.saveResult("s", display)).rejects.toThrow(
    "STORE_CAPACITY",
  );
  expect(await results.readDisplayResult("s")).toBeUndefined();
  expect(await results.consumeUserInfo("s")).toBeUndefined();
});
