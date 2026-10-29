import Link from "next/link";
import type { DisplayResult } from "@/shared/contracts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
export function ResultView({ result }: { result: DisplayResult }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <Card>
        <CardHeader>
          <Link className="text-sm text-primary" href="/">
            ← Back to Showcase
          </Link>
          <CardTitle className="text-2xl">{result.client_title}</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-[60vh] overflow-auto rounded-xl bg-muted p-5 text-sm">
            {JSON.stringify(result.userInfo, null, 2)}
          </pre>
          <dl className="mt-6 space-y-2 break-all text-sm text-muted-foreground">
            <div>Client ID: {result.client_id}</div>
            <div>State: {result.state as React.ReactNode}</div>
          </dl>
        </CardContent>
      </Card>
    </main>
  );
}
