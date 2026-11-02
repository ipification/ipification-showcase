import { providerCall } from "@/server/shared/errors";
import { randomUUID } from "node:crypto";
import {
  postForm,
  postJson,
  validateTokenResponse,
} from "@/server/shared/http-client";
interface Credentials {
  authServerUrl: string;
  realm: string;
  clientId: string;
  clientSecret: string;
}
export interface StartInput extends Credentials {
  reqScope?: unknown;
  scope?: string;
  loginHint?: unknown;
  carrierHint?: unknown;
  operation?: unknown;
}
export interface TokenInput extends Credentials {
  authReqId?: unknown;
  vpToken?: unknown;
  smsCode?: unknown;
}
export interface CibaStartResult {
  authReqId: unknown;
  nonce: string;
  digitalRequest?: {
    protocol: string;
    data: {
      response_type: string;
      response_mode: string;
      nonce: string;
      dcql_query: { credentials: unknown[] };
    };
  };
}

export async function sendSmsCode(input: StartInput): Promise<CibaStartResult> {
  const root = `${input.authServerUrl}/realms/${input.realm}/protocol/openid-connect`;
  const nonce = randomUUID();
  // 1. Ask the provider to send the verification PIN over SMS.
  const authReqId = await requestAuthentication(root, {
    client_id: input.clientId,
    client_secret: input.clientSecret,
    scope: input.reqScope || input.scope || "openid",
    login_hint: input.loginHint,
    channel: "sms",
    message: "Your verification PIN is: {{code}}",
  });
  // 2. The browser returns this request id when submitting the OTP.
  return { authReqId, nonce };
}

export async function verifySmsCode(input: TokenInput) {
  const root = `${input.authServerUrl}/realms/${input.realm}/protocol/openid-connect`;
  // 1. Submit the entered OTP for the same CIBA authentication request.
  await submitCallback(root + "/ext/bc/sms/callback", input.authReqId, {
    code: input.smsCode,
  });
  // 2. Exchange that request for a token, then fetch user info.
  return exchangeCibaTokenAndGetUserInfo(root, input);
}

export async function createSimCredentialRequest(
  input: StartInput,
): Promise<CibaStartResult> {
  const root = `${input.authServerUrl}/realms/${input.realm}/protocol/openid-connect`;
  const nonce = randomUUID();
  const form: Record<string, unknown> = {
    client_id: input.clientId,
    client_secret: input.clientSecret,
    scope: input.reqScope || input.scope || "openid",
  };
  if (input.loginHint) form.login_hint = input.loginHint;
  if (input.carrierHint) form.carrier_hint = input.carrierHint;
  // 1. Start CIBA authentication with the mobile/SIM hints.
  const authReqId = await requestAuthentication(root, form);
  // 2. Obtain the credential query the browser must pass to its credential API.
  const data = await providerCall("dcql", () =>
    postJson(
      root + "/ext/bc/ts43/dcql",
      {
        operation:
          input.operation ||
          (input.loginHint ? "VerifyPhoneNumber" : "GetPhoneNumber"),
        nonce,
      },
      { Authorization: `Bearer ${authReqId}` },
    ),
  );
  return {
    authReqId,
    nonce,
    digitalRequest: {
      protocol: "openid4vp-v1-unsigned",
      data: {
        response_type: "vp_token",
        response_mode: "dc_api",
        nonce,
        dcql_query: { credentials: [data] },
      },
    },
  };
}

export async function exchangeSimCredential(input: TokenInput) {
  const root = `${input.authServerUrl}/realms/${input.realm}/protocol/openid-connect`;
  // 1. Submit the credential obtained by the browser/device.
  await submitCallback(root + "/ext/bc/ts43/callback", input.authReqId, {
    vp_token: input.vpToken,
  });
  // 2. Exchange the authentication request for a token and user info.
  return exchangeCibaTokenAndGetUserInfo(root, input);
}

async function requestAuthentication(
  root: string,
  form: Record<string, unknown>,
) {
  const auth = await providerCall("authentication", () =>
    postForm(root + "/ext/ciba/auth", form),
  );
  if (!auth.auth_req_id)
    throw new Error("No authReqId received from auth response");
  return auth.auth_req_id;
}

async function submitCallback(
  url: string,
  authReqId: unknown,
  body: Record<string, unknown>,
) {
  try {
    await postJson(url, body, { Authorization: `Bearer ${authReqId}` });
  } catch {
    // Preserve the provider's best-effort callback step: still attempt /token.
    // Changing this to fail early would change both SMS and SIM behavior.
  }
}

// SMS and SIM share the CIBA token grant and userinfo request after their
// respective callback. Credentials remain on the server throughout.
async function exchangeCibaTokenAndGetUserInfo(
  root: string,
  input: TokenInput,
) {
  const token = await providerCall("token", async () =>
    validateTokenResponse(
      await postForm(root + "/token", {
        client_id: input.clientId,
        client_secret: input.clientSecret,
        grant_type: "urn:openid:params:grant-type:ciba",
        auth_req_id: input.authReqId,
      }),
    ),
  );
  return providerCall("userinfo", () =>
    postForm(root + "/userinfo", { access_token: token.access_token }),
  );
}
