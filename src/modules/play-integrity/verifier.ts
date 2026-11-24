import { UpstreamUnavailableError } from "@/shared/server/common/errors";
import axios from "axios";
import { GoogleAuth } from "google-auth-library";

const PLAY_INTEGRITY_SCOPE = "https://www.googleapis.com/auth/playintegrity";

interface AccessTokenClient {
  getAccessToken(): Promise<
    string | { token?: string | null } | null | undefined
  >;
}

interface IntegrityHttpClient {
  post(
    url: string,
    body: { integrity_token: string },
    options: { headers: Record<string, string>; timeout?: number },
  ): Promise<{ data: unknown }>;
}

interface DecodedIntegrityToken {
  tokenPayloadExternal?: {
    requestDetails?: {
      requestHash?: string;
      requestPackageName?: string;
    };
    appIntegrity?: { appRecognitionVerdict?: string | null };
    deviceIntegrity?: { deviceRecognitionVerdict?: unknown };
    accountDetails?: { appLicensingVerdict?: string | null };
  };
}

interface VerifyInput {
  integrityToken: string;
  expectedRequestHash?: string;
  expectedPackageName?: string;
}

interface ServiceOptions {
  packageName?: string;
  requireLicensedApp?: boolean;
  authClient?: AccessTokenClient;
  httpClient?: IntegrityHttpClient;
  timeoutMs?: number;
}

/** Provider/authentication failure with a stable reason code for API handling. */
class PlayIntegrityUnavailableError extends UpstreamUnavailableError {
  reasonCode: string;
  constructor(reasonCode: string, cause: unknown) {
    super(reasonCode, cause);
    this.name = "PlayIntegrityUnavailableError";
    this.reasonCode = reasonCode;
    this.cause = cause;
  }
}

/**
 * Creates a Play Integrity verifier with injectable Google auth and HTTP clients.
 *
 * @param options - Package name, license policy, adapters and request timeout.
 * @returns A `verify` operation for one integrity token.
 */
function createPlayIntegrityService(options: ServiceOptions) {
  const {
    packageName,
    requireLicensedApp = false,
    authClient = new GoogleAuth({ scopes: [PLAY_INTEGRITY_SCOPE] }),
    httpClient = axios,
    timeoutMs,
  } = options;
  /**
   * Decodes Google's response and evaluates it against the expected app/request.
   *
   * @param input - Integrity token and expected request hash/package name.
   * @returns Allow/deny decision, stable reason codes and safe verdict fields.
   * @throws `PlayIntegrityUnavailableError` when Google auth or decode is unavailable.
   */
  async function verify(input: VerifyInput) {
    // Google requires a service access token before its decode endpoint can be called.
    const accessToken = await getAccessToken(authClient);
    // Decode the opaque client token server-side, then evaluate only the returned verdict fields.
    const decoded = await decodeIntegrityToken({
      httpClient,
      packageName: input.expectedPackageName || packageName,
      integrityToken: input.integrityToken,
      accessToken,
      timeoutMs,
    });

    return evaluateVerdict({
      decoded,
      expectedRequestHash: input.expectedRequestHash,
      expectedPackageName: input.expectedPackageName || packageName,
      requireLicensedApp,
    });
  }

  return { verify };
}

/** @param authClient - Google service auth adapter. @returns Google access token. @throws `PlayIntegrityUnavailableError` when no token is available. */
async function getAccessToken(authClient: AccessTokenClient) {
  try {
    // GoogleAuth may return either the token string or an object containing it.
    const credential = await authClient.getAccessToken();
    const token =
      typeof credential === "string" ? credential : credential?.token;
    if (!token) throw new Error("access token unavailable");
    return token;
  } catch (error: unknown) {
    throw new PlayIntegrityUnavailableError(
      "GOOGLE_CREDENTIALS_UNAVAILABLE",
      error,
    );
  }
}

/** @param options - Google client, package, token, access token and timeout. @returns Decoded verdict payload. @throws `PlayIntegrityUnavailableError` for timeout or decode failure. */
async function decodeIntegrityToken({
  httpClient,
  packageName,
  integrityToken,
  accessToken,
  timeoutMs,
}: {
  httpClient: IntegrityHttpClient;
  packageName?: string;
  integrityToken: string;
  accessToken: string;
  timeoutMs?: number;
}): Promise<DecodedIntegrityToken> {
  try {
    // Send the integrity token to Google's package-specific decode endpoint.
    const response = await httpClient.post(
      `https://playintegrity.googleapis.com/v1/${packageName}:decodeIntegrityToken`,
      { integrity_token: integrityToken },
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: timeoutMs,
      },
    );
    return response.data as DecodedIntegrityToken;
  } catch (error: unknown) {
    const reasonCode = ["ECONNABORTED", "ETIMEDOUT"].includes(errorCode(error))
      ? "GOOGLE_DECODE_TIMEOUT"
      : "GOOGLE_DECODE_FAILED";
    throw new PlayIntegrityUnavailableError(reasonCode, error);
  }
}

/** @param error - Thrown HTTP/network value. @returns Its string `code`, or an empty string. */
function errorCode(error: unknown): string {
  return error && typeof error === "object" && "code" in error
    ? String(error.code)
    : "";
}

/** @param input - Decoded token and expected request/app policy. @returns Decision, reason codes, match result and safe verdict values. */
function evaluateVerdict({
  decoded,
  expectedRequestHash,
  expectedPackageName,
  requireLicensedApp,
}: {
  decoded: DecodedIntegrityToken;
  expectedRequestHash?: string;
  expectedPackageName?: string;
  requireLicensedApp: boolean;
}) {
  // Each failed comparison adds a stable reason code for the API response and logs.
  const tokenPayload = decoded?.tokenPayloadExternal;
  const requestDetails = tokenPayload?.requestDetails;
  const requestHash = requestDetails?.requestHash;
  const requestPackageName = requestDetails?.requestPackageName;
  const appRecognition =
    tokenPayload?.appIntegrity?.appRecognitionVerdict ?? null;
  const deviceIntegrity = Array.isArray(
    tokenPayload?.deviceIntegrity?.deviceRecognitionVerdict,
  )
    ? tokenPayload.deviceIntegrity.deviceRecognitionVerdict
    : [];
  const appLicensing =
    tokenPayload?.accountDetails?.appLicensingVerdict ?? null;
  const requestHashMatched = requestHash === expectedRequestHash;
  const packageNameMatched = requestPackageName === expectedPackageName;
  const reasonCodes = [];

  if (!requestHashMatched) reasonCodes.push("REQUEST_HASH_MISMATCH");
  if (!packageNameMatched) reasonCodes.push("PACKAGE_NAME_MISMATCH");
  if (appRecognition !== "PLAY_RECOGNIZED")
    reasonCodes.push("APP_NOT_RECOGNIZED");
  if (!deviceIntegrity.includes("MEETS_DEVICE_INTEGRITY")) {
    reasonCodes.push("DEVICE_INTEGRITY_NOT_MET");
  }
  if (requireLicensedApp && appLicensing !== "LICENSED")
    reasonCodes.push("APP_NOT_LICENSED");

  return {
    decision: reasonCodes.length === 0 ? "allow" : "deny",
    reasonCodes,
    requestHashMatched,
    verdict: {
      appRecognition,
      deviceIntegrity,
      appLicensing,
    },
  };
}

export { createPlayIntegrityService, PlayIntegrityUnavailableError };
