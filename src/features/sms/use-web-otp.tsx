"use client";
import { useEffect, useRef } from "react";
export function useWebOtp({
  enabled,
  onCode,
}: {
  enabled: boolean;
  onCode: (code: string) => void;
}) {
  const callback = useRef(onCode);
  useEffect(() => {
    callback.current = onCode;
  }, [onCode]);
  useEffect(() => {
    if (
      !enabled ||
      !window.isSecureContext ||
      !("OTPCredential" in window) ||
      !navigator.credentials
    )
      return;
    const ac = new AbortController();
    navigator.credentials
      .get({ otp: { transport: ["sms"] }, signal: ac.signal } as any)
      .then((credential: any) => {
        if (!ac.signal.aborted && credential?.code)
          callback.current(credential.code.replace(/\D/g, ""));
      })
      .catch(() => {});
    return () => ac.abort();
  }, [enabled]);
}
