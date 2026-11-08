import { expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { authAttempts, bindingHash } from "@/server/auth/attempts";
import { memoryStore } from "@/server/store/memory";

test("expired attempts fail even while their storage record exists", async () => {
  const state = randomUUID(),
    owner = "a".repeat(64);
  await authAttempts.create({
    state,
    userFlow: "login_ip",
    serverId: "stage",
    clientId: "c",
    origin: "http://localhost",
    qr: false,
    ownerHash: bindingHash(owner),
    status: "prepared",
    expiresAt: Date.now() - 1,
  });
  expect(memoryStore.get("oauth:" + state)).toBeDefined();
  await expect(
    authAttempts.readOwned(state, owner, "http://localhost"),
  ).rejects.toMatchObject({ reason: "AUTH_STATE_EXPIRED" });
});

test("QR start opens one completion window and rejects an expired scan", async () => {
  const owner = "b".repeat(64),
    callback = "c".repeat(64);
  const match = {
    userFlow: "login_ip",
    serverId: "stage",
    clientId: "c",
    origin: "http://localhost",
  };
  const value = {
    ...match,
    qr: true,
    ownerHash: bindingHash(owner),
    status: "prepared" as const,
  };
  const state = randomUUID() + "-qrcode";
  await authAttempts.create({
    ...value,
    state,
    expiresAt: Date.now() + 120000,
  });
  const started = await authAttempts.start(state, match, "", callback);
  expect(started.expiresAt - Date.now()).toBeGreaterThan(290000);
  await expect(
    authAttempts.start(state, match, "", callback),
  ).rejects.toMatchObject({ reason: "AUTH_STATE_REPLAYED" });
  const expired = randomUUID() + "-qrcode";
  await authAttempts.create({
    ...value,
    state: expired,
    expiresAt: Date.now() - 1,
  });
  await expect(
    authAttempts.start(expired, match, "", callback),
  ).rejects.toMatchObject({ reason: "AUTH_STATE_EXPIRED" });
});
