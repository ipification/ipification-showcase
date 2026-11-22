import { createServer } from "node:http";
import { generateKeyPairSync } from "node:crypto";
import jwt from "jsonwebtoken";
import { test, expect } from "vitest";
import { exchangeCodeAndGetUserInfo } from "@/shared/server/common/http-client";

test("browser exchange verifies signed ID token nonce and userinfo subject", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const otherKey = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  }).privateKey;
  const jwk = {
    ...publicKey.export({ format: "jwk" }),
    kid: "fixture",
    alg: "RS256",
    use: "sig",
  };
  let issuer = "",
    nonce = "expected",
    subject = "user",
    mode = "valid";
  const server = createServer(async (req, res) => {
    for await (const chunk of req) {
      void chunk;
    }
    res.setHeader("content-type", "application/json");
    if (req.url === "/certs") return res.end(JSON.stringify({ keys: [jwk] }));
    if (req.url === "/userinfo")
      return res.end(JSON.stringify({ sub: subject }));
    const id_token = jwt.sign(
      { nonce },
      mode === "signature" ? otherKey : privateKey,
      {
        algorithm: "RS256",
        keyid: "fixture",
        issuer: mode === "issuer" ? "https://wrong.example" : issuer,
        audience: mode === "audience" ? "other" : "client",
        subject: "user",
        expiresIn: mode === "expired" ? -120 : 60,
      },
    );
    return res.end(
      JSON.stringify({
        access_token: "access",
        token_type: "Bearer",
        ...(mode === "missing" ? {} : { id_token }),
      }),
    );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  issuer = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const params = {
    client_id: "client",
    client_secret: "secret",
    code: "code",
    redirect_uri: "https://example.test/callback",
    grant_type: "authorization_code",
  };
  const exchange = () =>
    exchangeCodeAndGetUserInfo(
      `${issuer}/token`,
      `${issuer}/userinfo`,
      params,
      { state: "state", nonce: "expected", jwksUri: `${issuer}/certs` },
    );
  try {
    expect((await exchange()).userInfo.sub).toBe("user");
    nonce = "wrong";
    await expect(exchange()).rejects.toThrow();
    nonce = "expected";
    subject = "other";
    await expect(exchange()).rejects.toThrow();
    subject = "user";
    for (const invalid of [
      "signature",
      "issuer",
      "audience",
      "expired",
      "missing",
    ]) {
      mode = invalid;
      await expect(exchange(), invalid).rejects.toThrow();
    }
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
