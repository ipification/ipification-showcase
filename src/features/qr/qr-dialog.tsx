"use client";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useAuthPolling } from "./use-auth-polling";
const complete = (url: string) => window.location.assign(url);
export function QrDialog({
  state,
  expiresAt,
  authUrl,
  title,
  onClose,
  onRefresh,
}: {
  state: string;
  expiresAt: number;
  authUrl: string;
  title: string;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const progress = useAuthPolling({
    state,
    expiresAt,
    onComplete: complete,
  });
  // The scan deadline is replaced only by an owner-authenticated started attempt's deadline.
  const deadline = progress.started ? progress.expiresAt : expiresAt;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = setInterval(update, 1000);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update);
    };
  }, []);
  const remaining = Number.isFinite(deadline)
    ? Math.max(0, Math.ceil((deadline - now) / 1000))
    : 0;
  const timedOut = remaining === 0 || progress.expired;
  const countdown = `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;
  const ready = progress.status === "ready" && !timedOut && !progress.started;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="legacy-dialog legacy-qr-dialog"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.target as HTMLElement).focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">
            Scan QR code with your phone
          </DialogDescription>
        </DialogHeader>
        <div className="legacy-qr-content">
          {ready ? (
            <>
              <div className="legacy-qr-code">
                <QRCodeSVG value={authUrl} size={212} level="L" />
              </div>
              <a
                data-testid="qr-auth-link"
                className="legacy-qr-link sr-only focus:not-sr-only"
                href={authUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open verification link
              </a>
            </>
          ) : timedOut ? (
            <div className="legacy-qr-recovery">
              <strong>QR code expired</strong>
              <p>
                This verification link has expired. Create a new QR code to
                continue.
              </p>
            </div>
          ) : progress.status === "disconnected" ? (
            <div className="legacy-qr-recovery">
              <strong>Connection interrupted</strong>
              <p>
                Check your connection, then create a new QR code to continue.
              </p>
            </div>
          ) : progress.started ? (
            <p role="status">
              Verification in progress… Complete the steps on your phone.
            </p>
          ) : (
            <p role="status">Connecting securely…</p>
          )}
        </div>
        <div className="legacy-qr-caption">
          {ready && <p>Scan QR code with your phone</p>}
          <p className="legacy-qr-status" role="status" aria-live="polite">
            {ready
              ? "Waiting for verification…"
              : timedOut
                ? "Create a new code to restart verification."
                : progress.started
                  ? "Waiting for the verification result…"
                  : progress.status === "disconnected"
                    ? "Unable to receive verification updates."
                    : "Preparing verification…"}
          </p>
          {!timedOut && (
            <p className="legacy-qr-expiry">
              {progress.started ? "Complete verification in" : "Expires in"}{" "}
              <span className="legacy-qr-countdown">{countdown}</span>
            </p>
          )}
          {(timedOut || progress.status === "disconnected") && (
            <button type="button" className="legacy-action" onClick={onRefresh}>
              Create new QR code
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
