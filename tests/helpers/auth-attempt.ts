import { expect } from "vitest";
export async function prepareAttempt(
  base: string,
  flow = "pvn_ip",
  qr = false,
) {
  const response = await fetch(base + "/auth/prepare", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ user_flow: flow, server_id: "stage", qr }),
  });
  expect(response.status).toBe(201);
  const data = await response.json();
  const owner = response.headers.get("set-cookie")!.split(";")[0];
  const start = await fetch(data.url, {
    redirect: "manual",
    headers: { cookie: owner },
  });
  expect(start.status).toBe(302);
  const callback = start.headers.get("set-cookie")!.split(";")[0];
  return { ...data, owner, callback, start } as {
    state: string;
    url: string;
    owner: string;
    callback: string;
    start: Response;
  };
}
