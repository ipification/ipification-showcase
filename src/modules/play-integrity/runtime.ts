import { createPlayIntegrityAttemptService } from "./attempts";
import { createPlayIntegrityService } from "./verifier";
import { exchangeCodeAndGetUserInfo } from "@/shared/server/common/http-client";
import { createIntegrityService } from "./service";
import { validateFeatureEnvironment } from "../../../runtime/config.mjs";
/**
 * Builds a request-ready service from validated environment settings and real adapters.
 *
 * @returns The Play Integrity service used by the HTTP handler.
 * @throws When required feature configuration is missing or invalid.
 */
export function runtimeIntegrityService() {
  // Validate feature configuration before constructing the adapters used by a request.
  validateFeatureEnvironment();
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
