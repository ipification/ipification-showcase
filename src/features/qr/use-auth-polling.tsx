"use client";
import { useEffect, useState } from "react";
import { watchAuthStatus } from "@/features/auth/auth-status";

export function useAuthPolling({
  state,
  expiresAt,
  onComplete,
}: {
  state: string;
  expiresAt: number;
  onComplete: (url: string) => void;
}) {
  const [status, setStatus] = useState<"connecting" | "ready" | "disconnected">(
    "connecting",
  );
  const [progress, setProgress] = useState({
    started: false,
    expiresAt: 0,
    expired: false,
  });
  useEffect(() => {
    if (!state || progress.expired) return;
    // A scan just before QR expiry can open a separate five-minute completion window.
    const polling = watchAuthStatus({
      state,
      origin: location.origin,
      maxExpiresAt: expiresAt + 300000,
      onUpdate(update) {
        switch (update.kind) {
          case "complete":
            onComplete(update.url);
            return;
          case "finished":
            onComplete(new URL("/user/info", location.origin).href);
            return;
          case "expired":
            setProgress((previous) => ({ ...previous, expired: true }));
            return;
          case "unavailable":
            setStatus("disconnected");
            return;
          case "pending":
            if (update.started)
              setProgress({
                started: true,
                expiresAt: update.expiresAt,
                expired: false,
              });
            setStatus("ready");
        }
      },
    });
    return () => polling.stop();
  }, [state, expiresAt, onComplete, progress.expired]);
  return { status, ...progress };
}
