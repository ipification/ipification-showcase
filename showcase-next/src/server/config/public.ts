import 'server-only';
import type {ServerConfig} from './load';
import type {PublicConfig,PublicShowcaseConfig,PublicClient} from '@/shared/contracts';
import pkg from '../../../package.json';
export function toPublicConfig(c:ServerConfig,origin:string):PublicConfig{
 const clients=c.clients.map(client=>{
  const result:PublicClient={user_flow:client.user_flow,client_id:client.client_id,scope:client.scope,redirect_uri:`${origin}/auth/callback/${client.user_flow}`};
  for(const field of ['title','channel','auth_server_url'] as const)if(client[field]!==undefined)result[field]=client[field];return result;
 });
 return {version:pkg.version,auth_servers:c.auth_servers.map(({id,url})=>({id,url})),realm:c.realm,clients,app_config:c.app_config};
}
export function toPublicShowcaseConfig(c:ServerConfig,origin:string):PublicShowcaseConfig{return {...toPublicConfig(c,origin),locale:c.locale,title:c.title||'IPification Showcase',appEnv:process.env.APP_ENV||'development',defaultCountry:c.default_country_code,disabledSelectCountry:!!c.disabled_select_country,logoUrl:c.app_logo_url,logoStyle:c.app_logo_style,faviconUrl:c.favicon_url||'/images/logo.ico',primaryColor:c.app_config.branding?.primary_color};}
