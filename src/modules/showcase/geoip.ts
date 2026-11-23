/** @module Country lookup */

import geoip from "geoip-lite";
import { resolveContext } from "@/shared/server/http/context";
import { json, unavailable } from "@/shared/server/http/response";
/**
 * `GET /api/geoip` suggests a country based on the resolved client IP.
 *
 * @param request - The incoming Showcase HTTP request.
 * @returns HTTP 200 with `country` and `ip`. A lookup miss uses the configured
 *   default country. Configuration failure returns 503.
 */
function getClientCountry(request: Request) {
  try {
    const context = resolveContext(request);
    let country = context.config.default_country_code || "rs";
    try {
      // Use GeoIP only as a phone-input suggestion; a miss must keep the configured default.
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
