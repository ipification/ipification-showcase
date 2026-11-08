"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicClient } from "@/shared/contracts";
import { needsPhone } from "@/shared/flow-catalog";
import type { PhoneValue } from "@/features/phone/phone-input";
import type { SmsInput } from "@/features/sms/use-sms-flow";
import { useTs43Flow } from "@/features/ts43/use-ts43-flow";

type QrVerification = {
  expiresAt: number;
  state: string;
  url: string;
  title: string;
  client: PublicClient;
};

/** Start here to follow a customer's selected verification method. */
export function useVerification({
  serverId,
  phone,
  mobile,
  invalidPhoneMessage,
}: {
  serverId: string;
  phone: PhoneValue;
  mobile: boolean;
  invalidPhoneMessage: string;
}) {
  const [qr, setQr] = useState<QrVerification | null>(null);
  const [sms, setSms] = useState<SmsInput | null>(null);
  const [error, setError] = useState("");
  const [activeFlow, setActiveFlow] = useState<string | null>(null);
  const sim = useTs43Flow();

  // React updates buttons after the event. This guard also blocks two clicks
  // arriving before that render; the id distinguishes cancelled/retried attempts.
  const attempt = useRef({ locked: false, id: 0 });
  const preparation = useRef<AbortController | null>(null);
  const releaseAttempt = useCallback(() => {
    preparation.current?.abort();
    preparation.current = null;
    attempt.current.locked = false;
    attempt.current.id++;
    setActiveFlow(null);
  }, []);

  useEffect(() => {
    // Returning with the browser's Back button must allow another attempt.
    window.addEventListener("pageshow", releaseAttempt);
    return () => {
      preparation.current?.abort();
      window.removeEventListener("pageshow", releaseAttempt);
    };
  }, [releaseAttempt]);

  function startVerification(client: PublicClient) {
    if (attempt.current.locked) return;
    setError("");
    if (!serverId) {
      setError("Please select an auth server");
      return;
    }
    if (needsPhone(client.user_flow) && !phone.valid) {
      setError(invalidPhoneMessage);
      return;
    }
    attempt.current.locked = true;
    attempt.current.id++;

    switch (client.user_flow) {
      case "pvn_sms":
        return startSmsVerification(client);
      case "pvn_sim":
      case "login_sim":
        return startSimVerification(client);
      case "pvn_im":
      case "login_im":
        return startMessagingVerification(client);
      case "anonymous":
      case "kyc_phone":
        return startIdentityVerification(client);
      default:
        return startIpVerification(client);
    }
  }

  function startIpVerification(client: PublicClient) {
    // On desktop the phone scans a QR; on mobile the same browser continues.
    openBrowserVerification(client, !mobile);
  }

  function startMessagingVerification(client: PublicClient) {
    // Messaging always continues through the browser, including on desktop.
    openBrowserVerification(client, false);
  }

  function startIdentityVerification(client: PublicClient) {
    // Anonymous identity omits the phone; KYC includes it (see needsPhone below).
    openBrowserVerification(client, !mobile);
  }

  async function openBrowserVerification(
    client: PublicClient,
    showQr: boolean,
  ) {
    const id = attempt.current.id;
    const controller = new AbortController();
    preparation.current?.abort();
    preparation.current = controller;
    setActiveFlow(client.user_flow);
    try {
      // This showcase endpoint prepares an owner-bound attempt for direct or QR use;
      // it is not an IPification provider endpoint.
      const response = await fetch("/auth/prepare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          user_flow: client.user_flow,
          server_id: serverId,
          qr: showQr,
          ...(needsPhone(client.user_flow) ? { phone: phone.number } : {}),
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Unable to prepare verification");
      const { state, url, expiresAt } = await response.json();
      if (controller.signal.aborted || id !== attempt.current.id) return;
      if (showQr) {
        setQr({
          expiresAt,
          state,
          url,
          client,
          title: client.title || "Verify your identity",
        });
        setActiveFlow(null);
      } else location.assign(url);
    } catch {
      if (controller.signal.aborted || id !== attempt.current.id) return;
      setQr(null);
      releaseAttempt();
      setError("Unable to open verification. Please try again.");
    } finally {
      if (preparation.current === controller) preparation.current = null;
    }
  }

  function startSmsVerification(client: PublicClient) {
    // Opening SmsDialog starts /sms/auth; submitting its OTP calls /sms/token.
    setSms({ clientId: client.client_id, serverId, phone: phone.number });
  }

  function startSimVerification(client: PublicClient) {
    const id = attempt.current.id;
    setActiveFlow(client.user_flow);
    // useTs43Flow shows the full request -> browser credential -> token sequence.
    void sim
      .start({
        clientId: client.client_id,
        serverId,
        phone: phone.number,
        login: client.user_flow === "login_sim",
      })
      .finally(() => {
        // A late completion from a cancelled request must not unlock a newer one.
        if (id === attempt.current.id) releaseAttempt();
      });
  }

  function cancelSimVerification() {
    sim.cancel();
    releaseAttempt();
  }

  function resetForTab() {
    setError("");
    releaseAttempt();
    setQr(null);
    setSms(null);
    sim.cancel();
  }

  function closeQr() {
    setQr(null);
    releaseAttempt();
  }
  function closeSms() {
    setSms(null);
    releaseAttempt();
  }
  function refreshQr() {
    if (!qr) return;
    if (preparation.current) return;
    attempt.current.id++;
    setQr(null);
    void openBrowserVerification(qr.client, true);
  }

  return {
    startVerification,
    activeFlow,
    error,
    sim,
    qr,
    sms,
    cancelSimVerification,
    resetForTab,
    closeQr,
    closeSms,
    refreshQr,
  };
}
