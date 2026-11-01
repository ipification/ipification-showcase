"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
export function useTs43Flow() {
  const router = useRouter();
  const generation = useRef(0),
    controller = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const cancel = useCallback(() => {
    generation.current++;
    controller.current?.abort();
    setPending(false);
  }, []);
  useEffect(
    () => () => {
      generation.current++;
      controller.current?.abort();
    },
    [],
  );
  async function start({
    clientId,
    serverId,
    phone,
    login,
  }: {
    clientId: string;
    serverId: string;
    phone?: string;
    login: boolean;
  }) {
    cancel();
    const current = generation.current;
    const ac = new AbortController();
    controller.current = ac;
    setPending(true);
    setError("");
    try {
      if (!navigator.credentials?.get)
        throw new Error(
          "SIM verification is unavailable in this browser. Use a supported mobile browser or choose another method.",
        );
      // 1. Get the credential request from the backend.
      const response = await fetch("/ts43/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          server_id: serverId,
          login_hint: login ? "anonymous" : phone,
          carrier_hint: 51010,
          scope: login ? "openid ip:phone" : "openid ip:phone_verify",
          ...(login ? { operation: "GetPhoneNumber" } : {}),
        }),
        signal: ac.signal,
      });
      const body = await response.json();
      if (current !== generation.current) return;
      if (!response.ok)
        throw new Error(body.error || "Unable to start SIM verification");
      // 2. Ask a supported browser/device to obtain the SIM credential.
      const credential: any = await navigator.credentials.get({
        digital: { requests: [body.digital_request] },
        signal: ac.signal,
      } as any);
      if (current !== generation.current) return;
      if (!credential) throw new Error("SIM verification was cancelled.");
      const data = credential.token || credential.data,
        vpToken = data?.vp_token?.["ipification.com"]?.[0];
      if (!vpToken)
        throw new Error(
          "This browser did not return a supported SIM credential. Choose another method.",
        );
      // 3. Send that credential to the backend for verification/token exchange.
      const token = await fetch("/ts43/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vp_token: vpToken,
          auth_req_id: body.auth_req_id,
          client_id: clientId,
          server_id: serverId,
          nonce: body.nonce,
        }),
        signal: ac.signal,
      });
      const tokenBody = await token.json();
      if (current !== generation.current) return;
      await fetch("/ts43/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: { type: "get_token_response", data: tokenBody },
        }),
        signal: ac.signal,
      });
      if (current === generation.current) {
        // 4. Read the session-backed result on the result page.
        router.push("/user/info");
        router.refresh();
      }
    } catch (error) {
      if (current === generation.current) {
        setError(
          error instanceof Error
            ? error.message
            : "SIM verification is unavailable. Choose another method.",
        );
        setPending(false);
      }
    }
  }
  return { start, cancel, pending, error };
}
