import { test, expect } from "vitest";
import { createServer } from "node:http";
import { io } from "socket.io-client";
import { startRedis } from "../helpers/redis";
import { startSocketServer } from "../../runtime/socket-server.mjs";
import { notifyAuthComplete } from "@/server/realtime/notifier";
import { closeRedis } from "@/server/store/redis";
test.each(["websocket", "polling"])(
  "real %s Socket.IO clients receive matching cross-server room events",
  async (transport) => {
    const redis = await startRedis();
    process.env.REDIS_URL = redis.url;
    process.env.SHOWCASE_KEY_PREFIX = "realtime-test:";
    const a = createServer(),
      b = createServer();
    const runtimeA = await startSocketServer(a, {
      redisUrl: redis.url,
      adapterKey: "realtime-test:socket.io",
    });
    const runtimeB = await startSocketServer(b, {
      redisUrl: redis.url,
      adapterKey: "realtime-test:socket.io",
    });
    await Promise.all([
      new Promise<void>((r) => a.listen(0, "127.0.0.1", r)),
      new Promise<void>((r) => b.listen(0, "127.0.0.1", r)),
    ]);
    const client = io(`http://127.0.0.1:${(a.address() as any).port}`, {
      transports: [transport],
    });
    try {
      await new Promise<void>((r) => client.on("connect", () => r()));
      await new Promise<void>((r) =>
        client.emit("init", { state: "test-qrcode" }, () => r()),
      );
      const message = new Promise<any>((r) =>
        client.on("messages", (data) => {
          if (data.event_name === "url") r(data);
        }),
      );
      await notifyAuthComplete(
        "test-qrcode",
        "http://showcase.test/auth/complete?state=test-qrcode",
      );
      expect(await message).toEqual({
        event_name: "url",
        url: "http://showcase.test/auth/complete?state=test-qrcode",
      });
    } finally {
      client.disconnect();
      await runtimeA.close();
      await runtimeB.close();
      a.closeAllConnections();
      b.closeAllConnections();
      await closeRedis();
      await redis.stop();
    }
  },
);
