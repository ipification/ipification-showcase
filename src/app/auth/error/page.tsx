import "@/features/login/legacy-showcase.css";
import { CircleAlert, ArrowLeft } from "lucide-react";
import {
  authFailures,
  authFailureReason,
  safeProviderCode,
} from "@/shared/auth-failures";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Sign-in unsuccessful | IPification Showcase",
  robots: { index: false, follow: false },
};
export default async function AuthError({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const reason = authFailureReason(query.reason),
    failure = authFailures[reason];
  const reference =
    typeof query.reference === "string" &&
    /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(query.reference)
      ? query.reference
      : undefined;
  const status =
    typeof query.status === "string" && /^[45]\d{2}$/.test(query.status)
      ? query.status
      : undefined;
  const providerCode = safeProviderCode(query.provider_error);
  const stage =
    query.stage === "token"
      ? "Authorization code exchange"
      : query.stage === "userinfo"
        ? "Profile retrieval"
        : undefined;
  return (
    <main className="legacy-error-page flex min-h-screen items-center justify-center px-5 py-12">
      <Card className="w-full max-w-xl">
        <CardHeader className="gap-4">
          <div className="flex size-12 items-center justify-center rounded-full bg-red-50 text-destructive">
            <CircleAlert aria-hidden="true" className="size-6" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            IPification Showcase
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {failure.title}
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            {failure.description}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg bg-muted p-4">
            <h2 className="mb-2 text-sm font-semibold">What you can do</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              {failure.action}
            </p>
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer font-medium">
              Error details
            </summary>
            <dl className="mt-3 space-y-2 break-words text-muted-foreground">
              <div>
                <dt className="font-medium text-foreground">Error code</dt>
                <dd>{reason}</dd>
              </div>
              {stage && (
                <div>
                  <dt className="font-medium text-foreground">Step</dt>
                  <dd>{stage}</dd>
                </div>
              )}
              {status && (
                <div>
                  <dt className="font-medium text-foreground">
                    Provider HTTP status
                  </dt>
                  <dd>{status}</dd>
                </div>
              )}
              {providerCode && (
                <div>
                  <dt className="font-medium text-foreground">
                    Provider error
                  </dt>
                  <dd>{providerCode}</dd>
                </div>
              )}
            </dl>
          </details>
          {reference && (
            <p className="break-all text-xs text-muted-foreground">
              Support reference: <span className="font-mono">{reference}</span>
            </p>
          )}
          <Button asChild className="w-full">
            <a href="/auth/login">
              <ArrowLeft aria-hidden="true" />
              Try again
            </a>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
