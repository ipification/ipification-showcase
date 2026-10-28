"use client";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useSmsFlow, type SmsInput } from "./use-sms-flow";
import { useWebOtp } from "./use-web-otp";
export function SmsDialog({
  input,
  onClose,
}: {
  input: SmsInput;
  onClose: () => void;
}) {
  const flow = useSmsFlow(input),
    [code, setCode] = useState("");
  useWebOtp({
    enabled: flow.status === "waiting",
    onCode: (value) => {
      setCode(value);
      void flow.submit(value);
    },
  });
  const close = () => {
    flow.cancel();
    onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Enter OTP code</DialogTitle>
          <DialogDescription>
            Enter the verification code sent to your phone.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void flow.submit(code);
          }}
        >
          <Label htmlFor="sms-code">OTP code</Label>
          <Input
            id="sms-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            autoComplete="one-time-code"
            inputMode="numeric"
            autoFocus
            disabled={
              flow.status === "starting" || flow.status === "submitting"
            }
          />
          {flow.status === "starting" && (
            <p role="status" className="text-sm">
              Sending code…
            </p>
          )}
          {flow.error && (
            <p role="alert" className="text-sm text-destructive">
              {flow.error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            {flow.status === "failed" ? (
              <Button type="button" onClick={() => void flow.start()}>
                Retry
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={!code || flow.status !== "waiting"}
              >
                {flow.status === "submitting" ? "Verifying…" : "Verify"}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
