import {getConfig} from '@/server/config/load';
export function resolveRequestIdentity(request:Request,options:{origin?:string;trustProxyHops:number}){
 const url=new URL(request.url);const trusted=options.trustProxyHops>0;
 const host=trusted?request.headers.get('x-forwarded-host')?.split(',')[0].trim()||request.headers.get('host')||url.host:request.headers.get('host')||url.host;
 const protocol=trusted?request.headers.get('x-forwarded-proto')?.split(',')[0].trim()||url.protocol.slice(0,-1):url.protocol.slice(0,-1);
 let incoming:URL;try{if(!['http','https'].includes(protocol))throw 0;incoming=new URL(`${protocol}://${host}`);if(incoming.username||incoming.password||incoming.pathname!=='/')throw 0;}catch{throw new Error('INVALID_HOST');}
 const chain=request.headers.get('x-forwarded-for')?.split(',').map(x=>x.trim())||[];
 return {origin:options.origin?.replace(/\/$/,'')||incoming.origin,hostname:incoming.hostname.toLowerCase(),clientIp:trusted?chain[Math.max(0,chain.length-options.trustProxyHops)]||'127.0.0.1':request.headers.get('x-showcase-peer-ip')||'127.0.0.1'};
}
export function resolveContext(request:Request){return {...resolveRequestIdentity(request,{origin:process.env.APP_ORIGIN,trustProxyHops:Number(process.env.TRUST_PROXY_HOPS||0)}),config:getConfig(),appEnv:process.env.APP_ENV||'development'};}
export type RequestContext=ReturnType<typeof resolveContext>;
export function findServer(context:RequestContext,id:unknown){return id?context.config.auth_servers.find(s=>s.id===id):context.config.auth_servers[0];}
