import { test, expect } from "vitest";
import { startRedis } from "../helpers/redis";
import { closeRedis } from "@/server/store/redis";
import { createPlayIntegrityAttemptService } from "@/server/integrity/attempts";
test("shared attempts and transactions are claimed once with fixed TTL", async () => {
  const redis = await startRedis();
  process.env.REDIS_URL = redis.url;
  process.env.SHOWCASE_KEY_PREFIX = "integrity-test:";
  const options = {
    stateSecret: "fixture-state-secret",
    stateIssuer: "fixture-issuer",
    stateAudience: "fixture-audience",
  };
  try {
    const a = createPlayIntegrityAttemptService(options),
      b = createPlayIntegrityAttemptService(options);
    const attempt = await a.createAttempt({
      phoneNumber: "+12025550123",
      clientId: "c",
      serverId: "stage",
      resolveClient: () => ({
        id: "c",
        client_id: "c",
        client_secret: "fixture-secret",
        redirectUri: "demo://callback",
      }),
      resolveServer: () => ({
        id: "stage",
        url: "http://provider.invalid",
        realm: "demo",
      }),
    });
    expect(attempt).not.toBeNull();
    const claims = await Promise.all([
      a.claimAttempt(attempt!.attemptId),
      b.claimAttempt(attempt!.attemptId),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const tx = await a.approveAttempt(attempt!.attemptId);
    expect(tx).not.toBeNull();
    const state = a.createSignedState(tx!);
    const transactions = await Promise.all([
      a.claimTransaction(state),
      b.claimTransaction(state),
    ]);
    expect(transactions.filter((t) => t.status === "claimed")).toHaveLength(1);
    expect((await b.claimTransaction(state)).status).toBe("unavailable");
    expect((await a.claimTransaction("forged")).status).toBe("invalid");
  } finally {
    await closeRedis();
    await redis.stop();
  }
});
