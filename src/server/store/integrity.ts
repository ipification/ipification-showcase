import { getRedis, key } from "./redis";
export function attemptKey(id: string) {
  return key(`integrity:{${id}}:attempt`);
}
export function transactionKey(attemptId: string, transactionId: string) {
  return key(`integrity:{${attemptId}}:transaction:${transactionId}`);
}
export async function readRecord(k: string) {
  const raw = await (await getRedis()).get(k);
  return raw ? JSON.parse(raw) : null;
}
export async function createRecord(k: string, value: any) {
  if (Date.parse(value.expiresAt) <= Date.now()) return false;
  return (
    (await (
      await getRedis()
    ).set(k, JSON.stringify(value), {
      PXAT: Date.parse(value.expiresAt),
      NX: true,
    })) === "OK"
  );
}
export async function transition(k: string, from: string, next: any) {
  return !!(await (
    await getRedis()
  ).eval(
    `local v=redis.call('GET',KEYS[1]);if not v then return 0 end;local old=cjson.decode(v);if old.status~=ARGV[1] then return 0 end;local ttl=redis.call('PTTL',KEYS[1]);if ttl<=0 then return 0 end;redis.call('SET',KEYS[1],ARGV[2],'PX',ttl);return 1`,
    { keys: [k], arguments: [from, JSON.stringify(next)] },
  ));
}
export async function approveRecords(
  id: string,
  transaction: any,
  approved: any,
) {
  return !!(await (
    await getRedis()
  ).eval(
    `local v=redis.call('GET',KEYS[1]);if not v then return 0 end;local old=cjson.decode(v);if old.status~='verifying' or redis.call('EXISTS',KEYS[2])==1 then return 0 end;local ttl=redis.call('PTTL',KEYS[1]);if ttl<=0 then return 0 end;redis.call('SET',KEYS[2],ARGV[1],'PX',ttl);redis.call('SET',KEYS[1],ARGV[2],'PX',ttl);return 1`,
    {
      keys: [attemptKey(id), transactionKey(id, transaction.id)],
      arguments: [JSON.stringify(transaction), JSON.stringify(approved)],
    },
  ));
}
