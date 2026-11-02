import { PendingAuthentication } from "@/features/login/pending-authentication";
export const dynamic = "force-dynamic";
export default async function PendingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { state } = await searchParams;
  return (
    <PendingAuthentication state={typeof state === "string" ? state : ""} />
  );
}
