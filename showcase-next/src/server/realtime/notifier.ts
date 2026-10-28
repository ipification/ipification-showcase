import "server-only";
import { Emitter } from "@socket.io/redis-emitter";
import { getRedis, key } from "@/server/store/redis";
export async function notifyAuthComplete(state: string, url: string) {
  const redis = await getRedis();
  if (!redis.isReady) throw new Error("REALTIME_UNAVAILABLE");
  // Emitter.emit returns true, not the Redis publication promise.
  const publications: Promise<unknown>[] = [];
  const publisher = {
    publish(channel: string, message: Buffer) {
      const publication = redis.publish(channel, message);
      publications.push(publication);
      return publication;
    },
  };
  new Emitter(publisher, { key: key("socket.io") })
    .to(`auth:${state}`)
    .emit("messages", { event_name: "url", url });
  await Promise.all(publications);
}
