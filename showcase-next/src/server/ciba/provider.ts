import { randomUUID } from "node:crypto";
import axios from "axios";
import { postForm } from "@/server/shared/http-client";
export type Protocol = "sms" | "ts43";
interface Credentials {
  authServerUrl: string;
  realm: string;
  clientId: string;
  clientSecret: string;
}
interface StartInput extends Credentials {
  reqScope?: unknown;
  scope?: string;
  loginHint?: unknown;
  carrierHint?: unknown;
  operation?: unknown;
}
interface TokenInput extends Credentials {
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
export async function startAuthentication(
  protocol: Protocol,
  {
    authServerUrl,
    realm,
    clientId,
    clientSecret,
    reqScope,
    scope,
    loginHint,
    carrierHint,
    operation,
  }: StartInput,
): Promise<CibaStartResult> {
  const root = `${authServerUrl}/realms/${realm}/protocol/openid-connect`,
    nonce = randomUUID();
  const form: Record<string, unknown> = {
    client_id: clientId,
    client_secret: clientSecret,
    scope: reqScope || scope || "openid",
  };
  if (protocol === "sms")
    Object.assign(form, {
      login_hint: loginHint,
      channel: "sms",
      message: "Your verification PIN is: {{code}}",
    });
  else {
    if (loginHint) form.login_hint = loginHint;
    if (carrierHint) form.carrier_hint = carrierHint;
  }
  const auth = await postForm(root + "/ext/ciba/auth", form);
  if (!auth.auth_req_id)
    throw new Error("No authReqId received from auth response");
  if (protocol === "sms") return { authReqId: auth.auth_req_id, nonce };
  const { data } = await axios.post<unknown>(
    root + "/ext/bc/ts43/dcql",
    {
      operation:
        operation || (loginHint ? "VerifyPhoneNumber" : "GetPhoneNumber"),
      nonce,
    },
    {
      headers: {
        Authorization: `Bearer ${auth.auth_req_id}`,
        "Content-Type": "application/json",
      },
    },
  );
  return {
    authReqId: auth.auth_req_id,
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
export async function exchangeToken(
  protocol: Protocol,
  {
    authServerUrl,
    realm,
    clientId,
    clientSecret,
    authReqId,
    vpToken,
    smsCode,
  }: TokenInput,
) {
  const root = `${authServerUrl}/realms/${realm}/protocol/openid-connect`;
  try {
    await axios.post(
      root + `/ext/bc/${protocol}/callback`,
      protocol === "sms" ? { code: smsCode } : { vp_token: vpToken },
      {
        headers: {
          Authorization: `Bearer ${authReqId}`,
          "Content-Type": "application/json",
        },
      },
    );
  } catch {}
  const token = await postForm(root + "/token", {
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "urn:openid:params:grant-type:ciba",
    auth_req_id: authReqId,
  });
  return postForm(root + "/userinfo", { access_token: token.access_token });
}
