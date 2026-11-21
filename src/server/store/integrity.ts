import { memoryStore } from "./memory";
export function attemptKey(id: string) {
  return `integrity:${id}:attempt`;
}
export function transactionKey(attemptId: string, transactionId: string) {
  return `integrity:${attemptId}:transaction:${transactionId}`;
}
export async function readRecord(k: string) {
  return memoryStore.get<any>(k) ?? null;
}
export async function createRecord(k: string, value: any) {
  const ttl = Date.parse(value.expiresAt) - Date.now();
  if (ttl <= 0 || memoryStore.get(k)) return false;
  memoryStore.set(k, value, ttl);
  return true;
}
export async function transition(k: string, from: string, next: any) {
  const old = memoryStore.get<any>(k);
  if (!old || old.status !== from) return false;
  const ttl = memoryStore.remaining(k);
  if (ttl <= 0) return false;
  memoryStore.set(k, next, ttl);
  return true;
}
export async function approveRecords(
  id: string,
  transaction: any,
  approved: any,
) {
  const a = attemptKey(id),
    t = transactionKey(id, transaction.id);
  const old = memoryStore.get<any>(a);
  if (!old || old.status !== "verifying" || memoryStore.get(t)) return false;
  const ttl = memoryStore.remaining(a);
  if (ttl <= 0) return false;
  memoryStore.set(t, transaction, ttl);
  memoryStore.set(a, approved, ttl);
  return true;
}
