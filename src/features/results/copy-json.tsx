"use client";
import { useState } from "react";

export function CopyJson({ json }: { json: string }) {
  const [status, setStatus] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(json);
      setStatus("JSON copied");
    } catch {
      setStatus("Unable to copy. Select the JSON below and copy it manually.");
    }
  }
  return (
    <div className="legacy-copy">
      <button
        type="button"
        className="legacy-action"
        onClick={() => void copy()}
      >
        Copy JSON
      </button>
      <p role="status">{status}</p>
    </div>
  );
}
