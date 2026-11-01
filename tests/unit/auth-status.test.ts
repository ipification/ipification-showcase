import { test, expect, vi, afterEach } from "vitest";
import {
  watchAuthStatus,
  completionUrlForAttempt,
  type AuthStatusUpdate,
} from "@/features/auth/auth-status";
const state = "12345678-1234-1234-1234-123456789abc";
const origin = "https://showcase.example";
const pending = { status: "pending", started: false, expiresAt: 120000 };
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
afterEach(() => {
  vi.useRealTimers();
});
function setup(fetcher: typeof fetch, extra = {}) {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const events: AuthStatusUpdate[] = [];
  const watcher = watchAuthStatus({
    state,
    origin,
    fetcher,
    maxExpiresAt: 420000,
    onUpdate: (event) => events.push(event),
    ...extra,
  });
  return { watcher, events };
}
test("completion URLs require the exact origin, path and single state", () => {
  expect(
    completionUrlForAttempt(`/auth/complete?state=${state}`, origin, state),
  ).toBe(`${origin}/auth/complete?state=${state}`);
  for (const value of [
    `https://evil.example/auth/complete?state=${state}`,
    `/auth/complete?state=wrong`,
    `/auth/complete?state=${state}&state=other`,
    `/other?state=${state}`,
    `https://user@showcase.example/auth/complete?state=${state}`,
  ])
    expect(completionUrlForAttempt(value, origin, state)).toBeUndefined();
});
test("checks never overlap and cleanup ignores a late response and clears all timers", async () => {
  let resolve!: (response: Response) => void;
  const fetcher = vi.fn(
    () =>
      new Promise<Response>((r) => {
        resolve = r;
      }),
  );
  const { watcher, events } = setup(fetcher as typeof fetch);
  void watcher.check();
  void watcher.check();
  expect(fetcher).toHaveBeenCalledTimes(1);
  watcher.stop();
  expect(vi.getTimerCount()).toBe(0);
  resolve(
    reply({
      status: "completed",
      completionUrl: `/auth/complete?state=${state}`,
    }),
  );
  await vi.advanceTimersByTimeAsync(0);
  expect(events).toEqual([]);
});
test("a hung check times out and a later check recovers", async () => {
  const fetcher = vi
    .fn()
    .mockImplementationOnce(
      (_url, options) =>
        new Promise((_resolve, reject) =>
          options.signal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          ),
        ),
    )
    .mockResolvedValue(reply(pending));
  const { watcher, events } = setup(fetcher as typeof fetch, {
    requestTimeoutMs: 20,
    intervalMs: 30,
  });
  await vi.advanceTimersByTimeAsync(20);
  expect(events.at(-1)).toEqual({ kind: "unavailable" });
  await vi.advanceTimersByTimeAsync(10);
  expect(events.at(-1)).toMatchObject({ kind: "pending", started: false });
  watcher.stop();
});
test("finished is terminal and never attempts a second completion", async () => {
  const fetcher = vi.fn().mockResolvedValue(reply({ status: "finished" }));
  const { watcher, events } = setup(fetcher as typeof fetch);
  await vi.advanceTimersByTimeAsync(10000);
  await watcher.check();
  expect(events).toEqual([{ kind: "finished" }]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
test("malformed or mismatched completion responses cannot navigate", async () => {
  const fetcher = vi.fn().mockResolvedValue(
    reply({
      status: "completed",
      completionUrl: "https://evil.example/auth/complete?state=" + state,
    }),
  );
  const { watcher, events } = setup(fetcher as typeof fetch);
  await vi.advanceTimersByTimeAsync(0);
  expect(events).toEqual([{ kind: "unavailable" }]);
  watcher.stop();
});
test("a permanent outage terminates at the hard deadline", async () => {
  const fetcher = vi.fn().mockRejectedValue(new TypeError("Offline"));
  const { events } = setup(fetcher as typeof fetch, {
    maxExpiresAt: 100,
    intervalMs: 20,
  });
  await vi.advanceTimersByTimeAsync(100);
  expect(events.at(-1)).toEqual({
    kind: "expired",
    reason: "AUTH_STATE_EXPIRED",
  });
  expect(vi.getTimerCount()).toBe(0);
});
test("a QR scanned just before scan expiry keeps its separate completion window", async () => {
  let scanned = false;
  const fetcher = vi.fn(async () =>
    reply({
      status: "pending",
      started: scanned,
      expiresAt: scanned ? 419000 : 120000,
    }),
  );
  const { watcher, events } = setup(fetcher as typeof fetch, {
    intervalMs: 3000,
  });
  await vi.advanceTimersByTimeAsync(0);
  vi.setSystemTime(119000);
  scanned = true;
  await watcher.check();
  await vi.advanceTimersByTimeAsync(2000);
  expect(events.at(-1)).toMatchObject({
    kind: "pending",
    started: true,
    expiresAt: 419000,
  });
  expect(events.some((event) => event.kind === "expired")).toBe(false);
  watcher.stop();
});

test("polls immediately and every two seconds, then stops after completion", async () => {
  const fetcher = vi.fn().mockImplementation(async () => reply(pending));
  const { events } = setup(fetcher as typeof fetch);
  await vi.advanceTimersByTimeAsync(0);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1999);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(fetcher).toHaveBeenCalledTimes(2);
  fetcher.mockImplementation(async () =>
    reply({
      status: "completed",
      completionUrl: `/auth/complete?state=${state}`,
    }),
  );
  await vi.advanceTimersByTimeAsync(2000);
  expect(events.at(-1)).toEqual({
    kind: "complete",
    url: `${origin}/auth/complete?state=${state}`,
  });
  await vi.advanceTimersByTimeAsync(10000);
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(vi.getTimerCount()).toBe(0);
});
