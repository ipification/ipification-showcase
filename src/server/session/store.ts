import { randomBytes } from "node:crypto";
import { getRedis, key } from "@/server/store/redis";
import type { SessionData } from "@/shared/contracts";
const valid = (id: string) => /^[a-f0-9]{64}$/.test(id);
export async function createSession(data: SessionData, previousId?: string) {
  const id = randomBytes(32).toString("hex");
  await (
    await getRedis()
  ).set(key("session:" + id), JSON.stringify(data), { EX: 3600 });
  if (previousId && valid(previousId)) await deleteSession(previousId);
  return id;
}
export async function readSession(id: string): Promise<SessionData | null> {
  if (!valid(id)) return null;
  const raw = await (await getRedis()).get(key("session:" + id));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
export async function deleteSession(id: string) {
  if (valid(id)) await (await getRedis()).del(key("session:" + id));
}
export async function consumeSessionError(id: string): Promise<string | null> {
  if (!valid(id)) return null;
  return (await (
    await getRedis()
  ).eval(
    `local v=redis.call('GET',KEYS[1]);if not v then return false end;local data=cjson.decode(v);local e=data.errorMessage;if not e then return false end;data.errorMessage=nil;local ttl=redis.call('PTTL',KEYS[1]);if ttl>0 then redis.call('SET',KEYS[1],cjson.encode(data),'PX',ttl) end;return e`,
    { keys: [key("session:" + id)], arguments: [] },
  )) as string | null;
}
