import { callback } from "@/server/auth/web";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  context: { params: Promise<{ userFlow: string; serverId: string }> },
) {
  return callback(request, await context.params);
}
