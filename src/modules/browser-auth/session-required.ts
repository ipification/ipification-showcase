import { legacyRedirect } from "@/shared/server/http/response";
export function GET() {
  return legacyRedirect("/");
}
