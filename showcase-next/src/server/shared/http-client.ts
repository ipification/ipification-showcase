import { providerCall } from "./errors";
import axios from "axios";
import qs from "qs";
export async function postForm<T = Record<string, unknown>>(
  url: string,
  data: Record<string, unknown>,
) {
  return (
    await axios.post<T>(url, qs.stringify(data), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    })
  ).data;
}
export async function exchangeCodeAndGetUserInfo(
  tokenUrl: string,
  userUrl: string,
  params: Record<string, unknown>,
) {
  const tokenInfo = await providerCall("token", () =>
    postForm(tokenUrl, params),
  );
  const userInfo = await providerCall("userinfo", () =>
    postForm(userUrl, {
      access_token: tokenInfo.access_token,
    }),
  );
  return { tokenInfo, userInfo };
}
