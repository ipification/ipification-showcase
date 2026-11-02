import Link from "next/link";
import type { DisplayResult } from "@/shared/contracts";
import "@/features/login/legacy-showcase.css";
import { CopyJson } from "./copy-json";
function ResultJson({ value }: { value: unknown }) {
  const json = JSON.stringify(value, null, 2) || "";
  const tokens = json.split(
    /("(?:\\.|[^"\\])*"\s*:|"(?:\\.|[^"\\])*"|\b(?:true|false|null)\b|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)/g,
  );
  return (
    <pre className="legacy-result-json">
      {tokens.map((token, index) => (
        <span
          key={index}
          className={
            /^".*:\s*$/.test(token)
              ? "legacy-json-key"
              : /^(?:true|false|null|-?\d)/.test(token)
                ? "legacy-json-value"
                : undefined
          }
        >
          {token}
        </span>
      ))}
    </pre>
  );
}
export function ResultView({ result }: { result: DisplayResult }) {
  return (
    <div className="legacy-result-page">
      <main className="legacy-result">
        <header>
          <h1>{result.client_title}</h1>
          <Link
            href="/"
            className="legacy-result-close"
            aria-label="Back to Showcase"
          >
            <span aria-hidden="true">×</span>
          </Link>
        </header>
        <section aria-label="Userinfo">
          <CopyJson json={JSON.stringify(result.userInfo, null, 2) || ""} />
          <ResultJson value={result.userInfo} />
        </section>
        {Object.hasOwn(result.userInfo ?? {}, "phone_number_verified") && (
          <aside
            className="legacy-result-help"
            aria-label="Phone verification explanation"
          >
            <h2>
              About <code>phone_number_verified</code>
            </h2>
            <p>
              <code>true</code> / <code>&quot;true&quot;</code>:{" "}
              <span>Phone verification succeeded.</span>
            </p>
            <p>
              <code>false</code> / <code>&quot;false&quot;</code>:{" "}
              <span>
                Phone verification did not succeed. Retry or use another method,
                such as SMS OTP.
              </span>
            </p>
            <p>Missing or other values do not confirm phone verification.</p>
            <p>
              Check this value in your backend before accepting verification.
              The string <code>&quot;false&quot;</code> is truthy in JavaScript.
            </p>
          </aside>
        )}
        <footer>
          <div>client id: {result.client_id}</div>
          <div>state: {result.state as React.ReactNode}</div>
        </footer>
      </main>
    </div>
  );
}
