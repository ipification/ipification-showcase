import {resolveContext,findServer,type RequestContext} from '@/server/http/context';
import {readBody} from '@/server/http/body';
import {json,text,unavailable} from '@/server/http/response';
import {createSession} from '@/server/session/store';
import {sessionId,setSessionCookie} from '@/server/session/cookies';
import {checkTs43Limit} from '@/server/store/rate-limit';
import * as provider from './provider';
async function handle(request:Request,protocol:provider.Protocol,operation:'auth'|'token'){
 let c:RequestContext,body:Record<string,any>,headers:Record<string,string>={};try{c=resolveContext(request);body=await readBody(request);if(protocol==='ts43'&&operation==='auth'){const limit=await checkTs43Limit(c,body);headers=limit.headers;if(!limit.allowed)return json({error:'RATE_LIMITED'},429,headers);}}catch{return unavailable();}
 const server=findServer(c,body.server_id);if(!server)return json({error:body.server_id?`Invalid server_id: '${body.server_id}'`:'No auth servers configured'},400);
 const client=c.config.clients.find(x=>x.client_id===body.client_id);if(!client)return operation==='auth'?text('Client not found',401):json({error:'Client not found'},401);
 const input={authServerUrl:server.url,realm:c.config.realm,clientId:body.client_id,clientSecret:client.client_secret};
 async function display(data:any,status:number){const id=await createSession({isAuthenticated:true,userData:{userInfo:data,client_id:body.client_id,client_title:protocol==='ts43'?'SIM':client!.title||'SMS',state:body.nonce}},sessionId(request));return setSessionCookie(json(status===200?{auth_server:server,...data}:data,status),id,c!.origin);}
 try{
 if(operation==='auth'){const result=await provider.startAuthentication(protocol,{...input,scope:client.scope,reqScope:body.scope,loginHint:body.login_hint,carrierHint:body.carrier_hint,operation:body.operation});return json({auth_server:server,auth_req_id:result.authReqId,nonce:result.nonce,...('digitalRequest' in result?{digital_request:result.digitalRequest}:{})},200,headers);}
 const user=await provider.exchangeToken(protocol,{...input,authReqId:body.auth_req_id,vpToken:body.vp_token,smsCode:body.code});return await display(user,200);
 }catch(error:any){const status=error.response?.status||500;const result={...(operation==='auth'?{auth_server:server,success:false}:{}),error:error.message||'Authentication failed',status,...(error.response?.data?{data:error.response.data}:{})};
 if(operation==='auth')return json(result,status,headers);try{return await display(result,status);}catch{return unavailable();}}
}
export const smsAuth=(r:Request)=>handle(r,'sms','auth');export const smsToken=(r:Request)=>handle(r,'sms','token');
export const ts43Auth=(r:Request)=>handle(r,'ts43','auth');export const ts43Token=(r:Request)=>handle(r,'ts43','token');
export async function diagnostics(request:Request){try{await readBody(request);return text('OK');}catch{return json({error:'INVALID_REQUEST'},400);}}
