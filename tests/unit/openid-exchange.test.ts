import { createServer } from "node:http";
import { test, expect } from "vitest";
import { exchangeCodeAndGetUserInfo } from "@/server/shared/http-client";

test("authorization code uses client_secret_post and userinfo uses Bearer without modifying claims", async () => {
  const calls: { path: string; authorization?: string; body: string }[] = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const part of req) body += part;
    calls.push({
      path: req.url!,
      authorization: req.headers.authorization,
      body,
    });
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify(
        req.url === "/token"
          ? { access_token: "fixture-token", token_type: "Bearer" }
          : {
              sub: "fixture-subject",
              phone_number_verified: false,
              extra: { value: 1 },
            },
      ),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const result = await exchangeCodeAndGetUserInfo(
      `${url}/token`,
      `${url}/userinfo`,
      {
        code: "test-code",
        redirect_uri: "https://example.com/callback",
        grant_type: "authorization_code",
        client_id: "test-client",
        client_secret: "test-secret",
      },
    );
    expect(result.userInfo).toEqual({
      sub: "fixture-subject",
      phone_number_verified: false,
      extra: { value: 1 },
    });
    expect(calls.map(({ path }) => path)).toEqual(["/token", "/userinfo"]);
    expect(
      Object.fromEntries(new URLSearchParams(calls[0].body)),
    ).toMatchObject({
      code: "test-code",
      redirect_uri: "https://example.com/callback",
      client_id: "test-client",
      client_secret: "test-secret",
    });
    expect(calls[1].authorization).toBe("Bearer fixture-token");
    expect(calls[1].body).not.toContain("fixture-token");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
