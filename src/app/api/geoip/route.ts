import geoip from "geoip-lite";
import { resolveContext } from "@/server/http/context";
import { json, unavailable } from "@/server/http/response";
export const dynamic = "force-dynamic";
function getClientCountry(request: Request) {
  try {
    const context = resolveContext(request);
    let country = context.config.default_country_code || "rs";
    try {
      // A GeoIP match takes precedence; keep the configured fallback on a miss/error.
      country = geoip.lookup(context.clientIp)?.country || country;
    } catch {
      // GeoIP is a convenience for the phone input and must not block the page.
    }
    return json({ country: country.toLowerCase(), ip: context.clientIp });
  } catch {
    return unavailable();
  }
}
export { getClientCountry as GET };
