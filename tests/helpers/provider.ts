import { generateKeyPairSync } from "node:crypto";
import jwt from "jsonwebtoken";
import { createServer } from "node:http";
export const providerNonces = new Map<string, string>();
export async function startProvider() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const jwk = {
    ...publicKey.export({ format: "jwk" }),
    kid: "fixture",
    alg: "RS256",
    use: "sig",
  };
  const calls: {
    operation: string;
    body: Record<string, any>;
    path: string;
  }[] = [];
  const responded: string[] = [];
  const behavior = {
    userInfo: {
      sub: "fixture-subject",
      phone_number: "+12025550123",
      phone_number_verified: "true",
    } as Record<string, unknown>,
    delays: {} as Record<string, number>,
    tokenDelay: 0,
    failAt: "",
    failStatus: 503,
    failBody: { error: "provider-unavailable" } as Record<string, unknown>,
    tokenResponse: {
      access_token: "fixture-token",
      token_type: "Bearer",
    } as unknown,
  };
  let origin = "";
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = req.headers["content-type"]?.includes("application/json")
      ? JSON.parse(raw || "{}")
      : Object.fromEntries(new URLSearchParams(raw));
    const path = req.url || "";
    const operation = path.endsWith("/ciba/auth")
      ? "auth"
      : path.endsWith("/dcql")
        ? "dcql"
        : path.endsWith("/callback")
          ? "callback"
          : path.endsWith("/token")
            ? "token"
            : "userinfo";
    if (path.endsWith("/certs")) {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ keys: [jwk] }));
      return;
    }
    calls.push({ operation, body, path });
    const delay =
      behavior.delays[operation] ||
      (operation === "token" ? behavior.tokenDelay : 0);
    if (delay) await new Promise((r) => setTimeout(r, delay));
    responded.push(operation);
    res.setHeader("Content-Type", "application/json");
    if (behavior.failAt === operation) {
      res.writeHead(behavior.failStatus);
      res.end(JSON.stringify(behavior.failBody));
      return;
    }
    let tokenResponse = behavior.tokenResponse;
    if (
      operation === "token" &&
      body.grant_type === "authorization_code" &&
      providerNonces.has(origin) &&
      tokenResponse &&
      typeof tokenResponse === "object"
    ) {
      tokenResponse = {
        ...tokenResponse,
        id_token: jwt.sign({ nonce: providerNonces.get(origin) }, privateKey, {
          algorithm: "RS256",
          keyid: "fixture",
          issuer: origin + path.split("/protocol/openid-connect/")[0],
          audience: body.client_id,
          subject: String(behavior.userInfo.sub),
          expiresIn: 60,
        }),
      };
    }
    res.end(
      JSON.stringify(
        {
          auth: { auth_req_id: "fixture-auth-id" },
          dcql: { id: "phone", format: "ts43" },
          callback: { ok: true },
          token: tokenResponse,
          userinfo: behavior.userInfo,
        }[operation],
      ),
    );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  origin = `http://127.0.0.1:${(server.address() as any).port}`;
  return {
    url: origin,
    calls,
    responded,
    behavior,
    stop: () => new Promise<void>((r) => server.close(() => r())),
  };
}
