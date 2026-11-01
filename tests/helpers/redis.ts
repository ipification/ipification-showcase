import { spawn } from "node:child_process";
import { createClient } from "redis";
import { freePort, stop } from "./processes";
export async function startRedis() {
  const port = await freePort();
  const child = spawn(
    "redis-server",
    [
      "--bind",
      "127.0.0.1",
      "--port",
      String(port),
      "--save",
      "",
      "--appendonly",
      "no",
    ],
    { stdio: "ignore" },
  );
  const url = `redis://127.0.0.1:${port}`;
  const client = createClient({ url, socket: { reconnectStrategy: false } });
  client.on("error", () => {});
  try {
    for (let i = 0; i < 50; i++) {
      try {
        await client.connect();
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 50));
      }
    }
    await client.ping();
  } catch (error) {
    await stop(child);
    throw error;
  }
  return {
    url,
    client,
    stop: async () => {
      if (client.isOpen) client.destroy();
      await stop(child);
    },
  };
}
