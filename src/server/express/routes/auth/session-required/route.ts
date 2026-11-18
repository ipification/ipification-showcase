import { legacyRedirect } from "@/server/http/response";
export function GET() {
  return legacyRedirect("/");
}
