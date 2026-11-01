import {
  providerCall,
  InvalidTokenResponseError,
  ProviderRequestTimeoutError,
} from "./errors";
import axios from "axios";
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
) {
  const tokenInfo = await providerCall("token", async () =>
    validateTokenResponse(await postForm(tokenUrl, params)),
  );
  const userInfo = await providerCall("userinfo", () =>
    postForm(userUrl, {
      access_token: tokenInfo.access_token,
    }),
  );
  return { tokenInfo, userInfo };
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
