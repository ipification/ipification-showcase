import geoip from 'geoip-lite';
import {resolveContext} from '@/server/http/context';
import {json,unavailable} from '@/server/http/response';
export const dynamic='force-dynamic';
export function GET(request:Request){try{const c=resolveContext(request);let country=c.config.default_country_code||'rs';try{country=geoip.lookup(c.clientIp)?.country||country;}catch{}return json({country:country.toLowerCase(),ip:c.clientIp});}catch{return unavailable();}}
