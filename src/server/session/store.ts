import { randomBytes } from "node:crypto";
import { memoryStore } from "@/server/store/memory";
import type { SessionData } from "@/shared/contracts";
const valid = (id: string) => /^[a-f0-9]{64}$/.test(id);
export async function createSession(data: SessionData, previousId?: string) {
  const id = randomBytes(32).toString("hex");
  memoryStore.set("session:" + id, data, 3600000);
  if (previousId && valid(previousId)) await deleteSession(previousId);
  return id;
}
export async function readSession(id: string): Promise<SessionData | null> {
  return valid(id)
    ? (memoryStore.get<SessionData>("session:" + id) ?? null)
    : null;
}
export async function deleteSession(id: string) {
  if (valid(id)) memoryStore.delete("session:" + id);
}
export async function consumeSessionError(id: string): Promise<string | null> {
  if (!valid(id)) return null;
  const key = "session:" + id,
    data = memoryStore.get<SessionData>(key);
  if (!data?.errorMessage) return null;
  const error = data.errorMessage;
  delete data.errorMessage;
  memoryStore.set(key, data, memoryStore.remaining(key));
  return error;
}
