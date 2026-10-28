import { headers } from "next/headers";
import { getConfig } from "@/server/config/load";
import { toPublicShowcaseConfig } from "@/server/config/public";
import { resolveRequestIdentity } from "@/server/http/context";
import { Showcase } from "@/features/login/showcase";
export const dynamic = "force-dynamic";
export default async function Login() {
  let config;
  try {
    const h = await headers();
    const identity = resolveRequestIdentity(
      new Request("http://localhost/auth/login", { headers: h }),
      {
        origin: process.env.APP_ORIGIN,
        trustProxyHops: Number(process.env.TRUST_PROXY_HOPS || 0),
      },
    );
    config = toPublicShowcaseConfig(getConfig(), identity.origin);
  } catch {}
  if (!config)
    return (
      <main className="mx-auto max-w-lg p-10">
        <h1 className="text-2xl font-semibold">Showcase is not ready</h1>
        <p className="mt-4">
          Check runtime configuration and service readiness, then retry.
        </p>
      </main>
    );
  return <Showcase config={config} />;
}

export function generateMetadata() {
  try {
    const config = getConfig();
    return {
      title: config.title || "IPification Showcase",
      icons: { icon: config.favicon_url || "/images/logo.ico" },
    };
  } catch {
    return { title: "IPification Showcase" };
  }
}
