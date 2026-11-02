import { createServer } from "node:http";
export async function startProvider() {
  const calls: {
    operation: string;
    body: Record<string, any>;
    path: string;
  }[] = [];
  const responded: string[] = [];
  const behavior = {
    userInfo: {
      phone_number: "+12025550123",
      phone_number_verified: "true",
    } as Record<string, unknown>,
    delays: {} as Record<string, number>,
    tokenDelay: 0,
    failAt: "",
    failStatus: 503,
    failBody: { error: "provider-unavailable" } as Record<string, unknown>,
    tokenResponse: { access_token: "fixture-token" } as unknown,
  };
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
    res.end(
      JSON.stringify(
        {
          auth: { auth_req_id: "fixture-auth-id" },
          dcql: { id: "phone", format: "ts43" },
          callback: { ok: true },
          token: behavior.tokenResponse,
          userinfo: behavior.userInfo,
        }[operation],
      ),
    );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return {
    url: `http://127.0.0.1:${(server.address() as any).port}`,
    calls,
    responded,
    behavior,
    stop: () => new Promise<void>((r) => server.close(() => r())),
  };
}
