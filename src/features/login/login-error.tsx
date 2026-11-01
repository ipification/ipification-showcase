"use client";
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
export function LoginError() {
  const [message, setMessage] = useState(""),
    started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    fetch("/auth/login/error", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (data.error_message) setMessage(data.error_message);
      })
      .catch(() => {});
  }, []);
  return (
    <Dialog
      open={!!message}
      onOpenChange={(open) => {
        if (!open) setMessage("");
      }}
    >
      <DialogContent
        className="legacy-callback-error"
        showCloseButton={false}
        aria-describedby={undefined}
      >
        <DialogTitle>{message}</DialogTitle>
      </DialogContent>
    </Dialog>
  );
}
