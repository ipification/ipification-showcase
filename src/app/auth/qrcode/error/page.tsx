import "@/features/login/legacy-showcase.css";
import { cookies } from "next/headers";
import { consumeSessionError } from "@/server/session/store";
export const dynamic = "force-dynamic";
export default async function Failure() {
  const id = (await cookies()).get("showcase_next_sid")?.value || "";
  const message = id ? await consumeSessionError(id) : null;
  return (
    <main className="legacy-status-page">
      <div className="legacy-status-message">
        <h1>Failure</h1>
        <p>{message || "Authentication unsuccessful"}</p>
        <span className="legacy-status-error" aria-hidden="true" />
        <a className="sr-only focus:not-sr-only" href="/auth/login">
          Try again
        </a>
      </div>
    </main>
  );
}
