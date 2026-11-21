import { test, expect } from "vitest";
import { memoryStore } from "@/server/store/memory";
import {
  createSession,
  readSession,
  consumeSessionError,
  deleteSession,
} from "@/server/session/store";
test("opaque sessions rotate, stay server-side and atomically consume errors", async () => {
  try {
    const id = await createSession({
      isAuthenticated: false,
      errorMessage: "once",
    });
    expect(id).toMatch(/^[a-f0-9]{64}$/);
    const errors = await Promise.all([
      consumeSessionError(id),
      consumeSessionError(id),
    ]);
    expect(errors.filter(Boolean)).toEqual(["once"]);
    const next = await createSession(
      {
        isAuthenticated: true,
        userData: {
          userInfo: { sub: "u" },
          state: "s",
          client_id: "c",
          client_title: "Phone",
        },
      },
      id,
    );
    expect(await readSession(id)).toBeNull();
    expect((await readSession(next))?.isAuthenticated).toBe(true);
    expect(memoryStore.remaining("session:" + next)).toBeGreaterThan(3590000);
    memoryStore.set("session:" + next, await readSession(next), 100);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(await readSession(next)).toBeNull();
    await deleteSession(next);
    expect(await readSession(next)).toBeNull();
    expect(await readSession("invalid")).toBeNull();
  } finally {
  }
});
