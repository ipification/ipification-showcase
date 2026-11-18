import { describe, expect, it } from "vitest";
import { Readable } from "node:stream";
import { toWebRequest, writeWebResponse } from "@/server/express/http";
describe("Express HTTP adapter", () => {
  it("retains URL and ignores the supplied peer header", () => {
    const req = Object.assign(Readable.from([]), {
      method: "GET",
      originalUrl: "/auth/status?state=a%2Bb",
      headers: { host: "localhost:3002", "x-showcase-peer-ip": "spoofed" },
      socket: { remoteAddress: "127.0.0.2" },
    });
    const request = toWebRequest(req as never);
    expect(request.url).toBe("http://localhost:3002/auth/status?state=a%2Bb");
    expect(request.headers.get("x-showcase-peer-ip")).toBe("127.0.0.2");
  });
  it("retains redirect and separate cookies", async () => {
    const headers = new Headers({ location: "/auth/login" });
    headers.append("set-cookie", "one=1; Path=/");
    headers.append("set-cookie", "two=2; Path=/");
    const values = new Map();
    const res = {
      statusCode: 0,
      setHeader: (k: string, v: unknown) => values.set(k, v),
      end: () => {},
    };
    await writeWebResponse(
      new Response(null, { status: 302, headers }),
      res as never,
    );
    expect(res.statusCode).toBe(302);
    expect(values.get("location")).toBe("/auth/login");
    expect(values.get("set-cookie")).toEqual([
      "one=1; Path=/",
      "two=2; Path=/",
    ]);
  });
});
