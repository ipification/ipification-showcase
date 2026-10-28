import {randomUUID} from 'node:crypto';
import {resolveContext,findServer} from '@/server/http/context';
import {query} from '@/server/http/body';
import {json,text,legacyRedirect,unavailable} from '@/server/http/response';
import {buildAuthorizationUrl,exchangeAuthorizationCode} from './provider';
import {saveResult,waitForResult} from '@/server/store/auth-results';
import {notifyAuthComplete} from '@/server/realtime/notifier';
import {createSession,readSession} from '@/server/session/store';
import {sessionId,setSessionCookie} from '@/server/session/cookies';
const errors:Record<string,string>={access_denied:'Authentication was cancelled.',login_required:'Authentication is required to continue.',operator_not_resolved:'Your mobile operator could not be resolved.',server_error:'Authentication is temporarily unavailable.',temporarily_unavailable:'Authentication is temporarily unavailable.'};
export async function start(request:Request){try{
 const c=resolveContext(request),q=query(request),server=findServer(c,q.server_id);
 if(!server)return json({error:q.server_id?'INVALID_SERVER_ID':'NO_AUTH_SERVERS_CONFIGURED'},400);
 const client=c.config.clients.find(x=>x.user_flow===q.user_flow);if(!client)return text('Client not found');
 if(!q.state)return legacyRedirect('/auth/login');
 return legacyRedirect(buildAuthorizationUrl({client,baseUrl:c.origin,userFlow:q.user_flow,server,realm:c.config.realm,state:q.state,phone:q.phone,appEnv:c.appEnv}));
 }catch{return unavailable();}}
export async function callback(request:Request,{userFlow,serverId}:{userFlow:string;serverId:string}){
 let c;try{c=resolveContext(request);}catch{return unavailable();}
 const q=query(request),state=q.state===undefined?randomUUID():q.state;
 if(q.error||q.error_description){try{const old=sessionId(request),existing=await readSession(old);const id=await createSession({...existing,isAuthenticated:existing?.isAuthenticated||false,errorMessage:errors[q.error]||'Unable to complete authentication.'},old);return setSessionCookie(legacyRedirect('/auth/login'),id,c.origin);}catch{return unavailable();}}
 const server=findServer(c,serverId);if(!server)return text(`Invalid server_id: '${serverId}'`,400);
 const client=c.config.clients.find(x=>x.user_flow===userFlow);if(!client)return text('Client not found');
 try{
 const {userInfo}=await exchangeAuthorizationCode({server,realm:c.config.realm,clientId:client.client_id,clientSecret:client.client_secret,redirectUri:`${c.origin}/auth/callback/${userFlow}/${server.id}`,code:q.code});
 const result={userInfo,client_id:client.client_id,client_title:client.title||'',state};await saveResult(state,result,userInfo);
 const url=`${c.origin}/auth/complete?state=${state}`;
 if(request.headers.get('ip-backchannel-im-auth')==='true')return new Response(null,{status:200,headers:{'Cache-Control':'private, no-store'}});
 if(typeof state!=='string')throw new Error('Invalid state');
 if(state.includes('-qrcode')){await notifyAuthComplete(state,url);return legacyRedirect(userInfo.phone_number_verified==='false'?'/auth/qrcode/error':'/auth/qrcode/complete');}
 return legacyRedirect(url);
 }catch(error){return text(error instanceof Error?error.message:'Authentication failed',400);}
}
export async function complete(request:Request){try{const c=resolveContext(request),q=query(request),result=await waitForResult(q.state);if(!result)return legacyRedirect('/');const id=await createSession({isAuthenticated:true,userData:result},sessionId(request));return setSessionCookie(legacyRedirect('/user/info'),id,c.origin);}catch{return unavailable();}}
