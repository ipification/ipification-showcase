import {randomUUID} from 'node:crypto';
import {resolveContext} from '@/server/http/context';
import {readBody} from '@/server/http/body';
import {json} from '@/server/http/response';
import {createPlayIntegrityAttemptService} from './attempts';
import {createPlayIntegrityService,PlayIntegrityUnavailableError} from './verifier';
import {exchangeCodeAndGetUserInfo} from '@/server/shared/http-client';
import {logRequest} from '@/server/shared/logger';
const nonempty=(value:unknown):value is string=>typeof value==='string'&&value.trim().length>0;
export async function handleIntegrity(request:Request,endpoint:'attempt'|'verify'|'token-exchange'){
 if(process.env.PLAY_INTEGRITY_ENABLED!=='true')return new Response(null,{status:404});
 const requestId=randomUUID(),start=Date.now();
 const respond=(status:number,body:any)=>{logRequest({requestId,endpoint,status,decision:body.decision||(status<300?'allow':'deny'),reasonCodes:body.reason_codes||[],duration:Date.now()-start});return json(body,status);};
 const deny=(status:number,reason:string,decision='deny')=>respond(status,{request_id:requestId,decision,reason_codes:[reason]});
 let body;try{body=await readBody(request,16384);}catch{return deny(400,'INVALID_REQUEST');}
 let context,attempts;try{context=resolveContext(request);attempts=createPlayIntegrityAttemptService({stateSecret:process.env.PLAY_INTEGRITY_STATE_SECRET!,stateIssuer:process.env.PLAY_INTEGRITY_STATE_ISSUER!,stateAudience:process.env.PLAY_INTEGRITY_STATE_AUDIENCE!});}catch{return deny(503,'SERVICE_UNAVAILABLE','unavailable');}
 try{
 if(endpoint==='attempt'){
 if(!nonempty(body.phone_number)||!nonempty(body.server_id))return deny(400,'INVALID_REQUEST');
 const c=context.config.clients.find(c=>c.user_flow===process.env.PLAY_INTEGRITY_USER_FLOW),server=context.config.auth_servers.find(s=>s.id===body.server_id);if(!c||!server)return deny(400,'INVALID_REQUEST');
 try{const result=await attempts.createAttempt({phoneNumber:body.phone_number,clientId:c.client_id,serverId:server.id,resolveClient:()=>({...c,id:c.client_id,redirectUri:c.redirect_uri||`${context.origin}/auth/callback/${c.user_flow}/${server.id}`}),resolveServer:()=>({...server,realm:context.config.realm})});return result?respond(201,{attempt_id:result.attemptId,request_hash:result.requestHash,expires_at:result.expiresAt}):deny(409,'ATTEMPT_UNAVAILABLE');}catch{return deny(400,'INVALID_REQUEST');}
 }
 if(endpoint==='verify'){
 if(!nonempty(body.attempt_id)||!nonempty(body.integrity_token))return deny(400,'INVALID_REQUEST');const attempt=await attempts.claimAttempt(body.attempt_id);if(!attempt)return deny(409,'ATTEMPT_UNAVAILABLE');
 try{
 const required=context.config.play_integrity_verify_domains?.some(d=>typeof d==='string'&&d.trim().toLowerCase()===context.hostname);
 const verdict=required?await createPlayIntegrityService({packageName:process.env.PLAY_INTEGRITY_PACKAGE_NAME,requireLicensedApp:process.env.PLAY_INTEGRITY_REQUIRE_LICENSED_APP==='true',timeoutMs:10000}).verify({integrityToken:body.integrity_token,expectedRequestHash:attempt.requestHash,expectedPackageName:process.env.PLAY_INTEGRITY_PACKAGE_NAME}):{decision:'allow',reasonCodes:[]};
 if(verdict.decision!=='allow'){await attempts.rejectAttempt(attempt.id,verdict.reasonCodes[0]||'POLICY_DENIED');return respond(403,{request_id:requestId,decision:'deny',reason_codes:verdict.reasonCodes});}
 const tx=await attempts.approveAttempt(attempt.id);if(!tx)return deny(409,'ATTEMPT_UNAVAILABLE');return respond(201,{state:attempts.createSignedState(tx),expires_at:tx.expiresAt});
 }catch(error){const reason=error instanceof PlayIntegrityUnavailableError?error.reasonCode:'GOOGLE_VERIFICATION_FAILED';await attempts.rejectAttempt(attempt.id,reason);return deny(503,reason,'unavailable');}
 }
 if(!nonempty(body.code)||!nonempty(body.state)||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(body.state))return deny(400,'INVALID_REQUEST');
 const claim=await attempts.claimTransaction(body.state);if(claim.status==='invalid')return deny(400,'INVALID_STATE');if(claim.status!=='claimed'||!claim.transaction)return deny(409,'TRANSACTION_UNAVAILABLE');
 const tx=claim.transaction,a=tx.attempt,root=`${a.server.url.replace(/\/$/,'')}/realms/${encodeURIComponent(a.server.realm)}/protocol/openid-connect`;
 try{const {userInfo}=await exchangeCodeAndGetUserInfo(root+'/token',root+'/userinfo',{code:body.code,redirect_uri:a.client.redirectUri,grant_type:'authorization_code',client_id:a.client.client_id,client_secret:a.client.client_secret});await attempts.completeTransaction(tx.id,'consumed');return respond(200,{decision:'allow',user_info:userInfo});}
 catch{await attempts.completeTransaction(tx.id,'failed');return deny(401,'IPIFICATION_EXCHANGE_FAILED');}
 }catch{return deny(503,'SERVICE_UNAVAILABLE','unavailable');}
}
