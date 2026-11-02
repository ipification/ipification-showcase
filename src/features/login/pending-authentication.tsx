"use client";
import { useEffect, useRef, useState } from "react";
import { watchAuthStatus } from "@/features/auth/auth-status";

/** IM can return to the browser before its server-to-server exchange finishes. */
export function PendingAuthentication({ state }: { state: string }) {
  const [unavailable, setUnavailable] = useState(false);
  const polling = useRef<ReturnType<typeof watchAuthStatus> | null>(null);
  useEffect(() => {
    const watcher = watchAuthStatus({
      state,
      origin: location.origin,
      maxExpiresAt: Date.now() + 300000,
      onUpdate(update) {
        switch (update.kind) {
          case "complete":
            location.replace(update.url);
            return;
          case "finished":
            location.replace("/user/info");
            return;
          case "expired":
            location.replace("/auth/error?reason=" + update.reason);
            return;
          case "unavailable":
            setUnavailable(true);
            return;
          case "pending":
            setUnavailable(false);
        }
      },
    });
    polling.current = watcher;
    return () => {
      watcher.stop();
      polling.current = null;
    };
  }, [state]);
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-5">
      <h1 className="text-xl font-semibold" role="status">
        Completing verification…
      </h1>
      {unavailable ? (
        <>
          <p role="alert">
            Connection interrupted. We will keep checking for your result.
          </p>
          <button
            type="button"
            className="underline"
            onClick={() => {
              void polling.current?.check();
            }}
          >
            Retry now
          </button>
        </>
      ) : (
        <p>Please keep this page open while your result arrives.</p>
      )}
      <a href="/auth/login" className="underline">
        Return to login
      </a>
    </main>
  );
}
