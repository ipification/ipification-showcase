"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
export interface SmsInput {
  clientId: string;
  serverId: string;
  phone: string;
}
export function useSmsFlow({ clientId, serverId, phone }: SmsInput) {
  const router = useRouter();
  const inFlight = useRef(false);
  const generation = useRef(0),
    controller = useRef<AbortController | null>(null),
    auth = useRef<{ auth_req_id: string; nonce: string } | null>(null);
  const [status, setStatus] = useState<
      "starting" | "waiting" | "submitting" | "failed"
    >("starting"),
    [error, setError] = useState("");
  const cancel = useCallback(() => {
    generation.current++;
    controller.current?.abort();
    auth.current = null;
    inFlight.current = false;
  }, []);
  const start = useCallback(async () => {
    cancel();
    const current = generation.current;
    const ac = new AbortController();
    controller.current = ac;
    setStatus("starting");
    setError("");
    try {
      const response = await fetch("/sms/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          server_id: serverId,
          login_hint: phone,
          scope: "openid ip:phone_verify",
        }),
        signal: ac.signal,
      });
      const body = await response.json();
      if (current !== generation.current) return;
      if (!response.ok)
        throw new Error(body.error || "Unable to start SMS verification");
      auth.current = { auth_req_id: body.auth_req_id, nonce: body.nonce };
      setStatus("waiting");
    } catch (error) {
      if (current === generation.current) {
        setError(
          error instanceof Error
            ? error.message
            : "Unable to start SMS verification",
        );
        setStatus("failed");
      }
    }
  }, [cancel, clientId, serverId, phone]);
  const submit = useCallback(
    async (code: string) => {
      if (!auth.current || !code || inFlight.current) return;
      inFlight.current = true;
      const current = generation.current;
      setStatus("submitting");
      setError("");
      try {
        const response = await fetch("/sms/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...auth.current,
            client_id: clientId,
            server_id: serverId,
            code: code.replace(/\D/g, ""),
          }),
          signal: controller.current?.signal,
        });
        const body = await response.json();
        if (current !== generation.current) return;
        await fetch("/sms/log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            data: { type: "get_token_response", data: body },
          }),
          signal: controller.current?.signal,
        });
        if (current !== generation.current) return;
        if (!response.ok)
          throw new Error(
            body.data?.error_description ||
              body.error ||
              "Unable to verify OTP code",
          );
        router.push("/user/info");
        router.refresh();
      } catch (error) {
        if (current === generation.current) {
          setError(
            error instanceof Error
              ? error.message
              : "Unable to verify OTP code",
          );
          setStatus("waiting");
        }
      } finally {
        if (current === generation.current) inFlight.current = false;
      }
    },
    [clientId, serverId, router],
  );
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) void start();
    });
    return () => {
      active = false;
      cancel();
    };
  }, [start, cancel]);
  return { status, error, submit, cancel, start };
}
