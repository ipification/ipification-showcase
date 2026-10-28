import {resolveContext,findServer} from '@/server/http/context';
import {readBody} from '@/server/http/body';
import {json,unavailable} from '@/server/http/response';
import {exchangeAuthorizationCode} from './provider';
export async function mobileLogin(request:Request){
 let c,body;try{c=resolveContext(request);body=await readBody(request);}catch{return unavailable();}
 const server=findServer(c,body.server_id);if(!server)return json({error:body.server_id?`Invalid server_id: '${body.server_id}'`:'No auth servers configured'},400);
 const client=c.config.clients.find(x=>x.client_id===body.client_id);if(!client)return json({error:'Client not found'},401);
 try{const {userInfo}=await exchangeAuthorizationCode({server,realm:c.config.realm,clientId:body.client_id,clientSecret:client.client_secret,redirectUri:body.redirect_uri,code:body.code});return json({auth_server:server,...userInfo});}catch(error){return json({error:error instanceof Error?error.message:'Authentication failed'},401);}
}
