import { createPlayIntegrityAttemptService } from "./attempts";
import { createPlayIntegrityService } from "./verifier";
import { exchangeCodeAndGetUserInfo } from "@/server/shared/http-client";
import { createIntegrityService } from "./service";
/** Composition root: environment and concrete adapters stay outside the service. */
export function runtimeIntegrityService() {
  const packageName = process.env.PLAY_INTEGRITY_PACKAGE_NAME;
  return createIntegrityService({
    attempts: createPlayIntegrityAttemptService({
      stateSecret: process.env.PLAY_INTEGRITY_STATE_SECRET!,
      stateIssuer: process.env.PLAY_INTEGRITY_STATE_ISSUER!,
      stateAudience: process.env.PLAY_INTEGRITY_STATE_AUDIENCE!,
    }),
    verify: (input) =>
      createPlayIntegrityService({
        packageName,
        requireLicensedApp:
          process.env.PLAY_INTEGRITY_REQUIRE_LICENSED_APP === "true",
        timeoutMs: 10000,
      }).verify(input),
    exchange: exchangeCodeAndGetUserInfo,
    policy: { packageName, userFlow: process.env.PLAY_INTEGRITY_USER_FLOW },
  });
}
