"use client";
import { QRCodeSVG } from "qrcode.react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useAuthSocket } from "./use-auth-socket";
const complete = (url: string) => window.location.assign(url);
export function QrDialog({
  state,
  authUrl,
  title,
  onClose,
}: {
  state: string;
  authUrl: string;
  title: string;
  onClose: () => void;
}) {
  const ready = useAuthSocket({ enabled: true, state, onComplete: complete });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Scan this code with your phone to continue.
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-64 flex-col items-center justify-center gap-5 py-4">
          {ready ? (
            <>
              <QRCodeSVG value={authUrl} size={212} level="L" />
              <p role="status" className="text-sm text-muted-foreground">
                Waiting for verification…
              </p>
              <a
                data-testid="qr-auth-link"
                className="text-sm text-primary underline"
                href={authUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open verification link
              </a>
            </>
          ) : (
            <p role="status">Connecting securely…</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
