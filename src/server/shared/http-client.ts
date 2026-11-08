import {
  providerCall,
  InvalidTokenResponseError,
  ProviderRequestTimeoutError,
} from "./errors";
import axios from "axios";
import * as oidc from "openid-client";
import type { UserInfo } from "@/shared/contracts";
import qs from "qs";
const DEFAULT_PROVIDER_TIMEOUT_MS = 15000;
function providerTimeoutMs() {
  const value = process.env.PROVIDER_HTTP_TIMEOUT_MS || "";
  const timeout = /^\d+$/.test(value) ? Number(value) : 0;
  return timeout >= 1 && timeout <= 120000
    ? timeout
    : DEFAULT_PROVIDER_TIMEOUT_MS;
}

async function providerPost<T>(
  url: string,
  data: unknown,
  headers: Record<string, string>,
) {
  const timeout = providerTimeoutMs();
  try {
    // Bound connection and response time. Authentication codes are never retried here.
    return (
      await axios.post<T>(url, data, {
        headers,
        timeout,
        signal: AbortSignal.timeout(timeout),
      })
    ).data;
  } catch (error) {
    if (
      axios.isAxiosError(error) &&
      ["ECONNABORTED", "ETIMEDOUT", "ERR_CANCELED"].includes(error.code || "")
    )
      throw new ProviderRequestTimeoutError();
    throw error;
  }
}

export function postForm<T = Record<string, unknown>>(
  url: string,
  data: Record<string, unknown>,
) {
  return providerPost<T>(url, qs.stringify(data), {
    "Content-Type": "application/x-www-form-urlencoded",
  });
}
export function postJson<T = unknown>(
  url: string,
  data: unknown,
  headers: Record<string, string> = {},
) {
  return providerPost<T>(url, data, {
    "Content-Type": "application/json",
    ...headers,
  });
}
export async function exchangeCodeAndGetUserInfo(
  tokenUrl: string,
  userUrl: string,
  params: Record<string, unknown>,
): Promise<{
  tokenInfo: Record<string, unknown> & { access_token: string };
  userInfo: UserInfo;
}> {
  const tokenEndpoint = new URL(tokenUrl);
  const userInfoEndpoint = new URL(userUrl);
  const config = new oidc.Configuration(
    {
      issuer: tokenEndpoint.href.includes("/protocol/openid-connect/")
        ? tokenEndpoint.href.split("/protocol/openid-connect/")[0]
        : tokenEndpoint.origin,
      token_endpoint: tokenEndpoint.href,
      userinfo_endpoint: userInfoEndpoint.href,
    },
    String(params.client_id || ""),
    String(params.client_secret || ""),
  );
  config.timeout = providerTimeoutMs() / 1000;
  // HTTP is only enabled for the loopback fixture used by local tests.
  if (
    tokenEndpoint.protocol === "http:" &&
    userInfoEndpoint.protocol === "http:" &&
    ["127.0.0.1", "localhost", "[::1]"].includes(tokenEndpoint.hostname) &&
    tokenEndpoint.origin === userInfoEndpoint.origin
  )
    oidc.allowInsecureRequests(config);
  const grantParameters = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (
      !["client_id", "client_secret", "grant_type"].includes(name) &&
      value != null
    )
      grantParameters.set(name, String(value));
  }
  // 1. Exchange the authorization code at the provider token endpoint.
  const tokenInfo = await providerCall("token", async () => {
    try {
      return await oidc.genericGrantRequest(
        config,
        String(params.grant_type || "authorization_code"),
        grantParameters,
      );
    } catch (error) {
      throw normalizeOidcError(error, true);
    }
  });
  // 2. Use the returned access token to request provider userinfo.
  const userInfo = await providerCall("userinfo", async () => {
    try {
      // Demo limitation: no validated ID-token subject is available for comparison.
      // Browser callbacks bind state separately; clients must implement their own
      // provider-supported OIDC validation. See docs/integration/browser.md.
      return await oidc.fetchUserInfo(
        config,
        tokenInfo.access_token,
        oidc.skipSubjectCheck,
      );
    } catch (error) {
      throw normalizeOidcError(error, false);
    }
  });
  return { tokenInfo, userInfo };
}

function normalizeOidcError(error: unknown, token: boolean): unknown {
  if (error && typeof error === "object") {
    const details = error as {
      code?: string;
      status?: number;
      message?: string;
      cause?: unknown;
      response?: Response;
    };
    if (details.code === "OAUTH_TIMEOUT")
      return new ProviderRequestTimeoutError();
    if (token && details.code === "OAUTH_INVALID_RESPONSE")
      return new InvalidTokenResponseError();
    const status =
      details.status ||
      details.response?.status ||
      (details.cause instanceof Response ? details.cause.status : undefined);
    if (status)
      return {
        message: `Request failed with status code ${status}`,
        response: {
          status,
          data:
            details.cause && !(details.cause instanceof Response)
              ? details.cause
              : undefined,
        },
      };
  }
  return error;
}

export function validateTokenResponse(
  value: unknown,
): Record<string, unknown> & { access_token: string } {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !("access_token" in value) ||
    typeof value.access_token !== "string" ||
    !value.access_token.trim()
  )
    throw new InvalidTokenResponseError();
  return value as Record<string, unknown> & { access_token: string };
}
