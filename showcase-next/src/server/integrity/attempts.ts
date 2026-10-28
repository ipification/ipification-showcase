import {randomUUID,createHash} from 'node:crypto';
import jwt from 'jsonwebtoken';
import {createRequestHash} from '@/server/shared/canonical-json';
import {normalizePhoneNumber} from '@/server/shared/phone-number';
import {attemptKey,transactionKey,readRecord,createRecord,transition,approveRecords} from '@/server/store/integrity';
const ACTION='IPIFICATION_AUTH';
function frozen<T>(value:T):T{const copy=structuredClone(value);function freeze(v:any){if(v&&typeof v==='object'){for(const child of Object.values(v))freeze(child);Object.freeze(v);}}freeze(copy);return copy;}
export function createPlayIntegrityAttemptService({stateSecret,stateIssuer,stateAudience}:{stateSecret:string;stateIssuer:string;stateAudience:string}){
 for(const value of [stateSecret,stateIssuer,stateAudience])if(!value)throw new Error('INVALID_STATE_CONFIG');
 async function createAttempt({phoneNumber,clientId,serverId,resolveClient,resolveServer}:any){
  if(typeof clientId!=='string'||!clientId||typeof serverId!=='string'||!serverId)throw new Error('INVALID_REQUEST');
  const phone=normalizePhoneNumber(phoneNumber),createdAt=Date.now(),id=randomUUID();
  const [client,server]=await Promise.all([resolveClient(clientId),resolveServer(serverId)]);if(!client||client.id!==clientId||!server||server.id!==serverId)throw new Error('INVALID_REQUEST');
  const expiresAt=new Date(createdAt+120000).toISOString(),phoneNumberHash=createHash('sha256').update(phone).digest('base64url');
  const requestHash=createRequestHash(ACTION,{attemptId:id,clientId,serverId,phoneNumberHash});
  const attempt=frozen({id,action:ACTION,phoneNumber:phone,phoneNumberHash,clientId,serverId,client,server,requestHash,status:'created',createdAt:new Date(createdAt).toISOString(),expiresAt});
  return await createRecord(attemptKey(id),attempt)?{attemptId:id,requestHash,expiresAt}:null;
 }
 async function updateAttempt(id:string,from:string,to:string,extra={}){const old=await readRecord(attemptKey(id));if(!old||old.status!==from)return null;const next={...old,...extra,status:to};return await transition(attemptKey(id),from,next)?frozen(next):null;}
 async function claimAttempt(id:string){return updateAttempt(id,'created','verifying');}
 async function rejectAttempt(id:string,reason='REJECTED'){return updateAttempt(id,'verifying','rejected',{reason:String(reason)});}
 async function approveAttempt(id:string){const old=await readRecord(attemptKey(id));if(!old||old.status!=='verifying')return null;
  const transaction={id:`${id}--${randomUUID()}`,attemptId:id,attempt:frozen(old),status:'approved',createdAt:new Date().toISOString(),expiresAt:old.expiresAt};
  return await approveRecords(id,transaction,{...old,status:'approved'})?frozen(transaction):null;
 }
 function createSignedState(transaction:any){if(transaction?.status!=='approved'||!transaction.attempt)throw new Error('INVALID_TRANSACTION');return jwt.sign({typ:ACTION,tx:transaction.id,aid:transaction.attempt.id,act:transaction.attempt.action},stateSecret,{algorithm:'HS512',expiresIn:'120s',issuer:stateIssuer,audience:stateAudience,jwtid:randomUUID()});}
 async function claimTransaction(state:string){let claims:any;try{claims=jwt.verify(state,stateSecret,{algorithms:['HS512'],issuer:stateIssuer,audience:stateAudience});}catch{return {status:'invalid'};}
  if(claims.typ!==ACTION||typeof claims.tx!=='string'||typeof claims.aid!=='string'||claims.act!==ACTION||!/^[-\w]+$/.test(claims.aid)||!/^[-\w]+$/.test(claims.tx))return {status:'invalid'};
  const k=transactionKey(claims.aid,claims.tx),tx=await readRecord(k);if(!tx||tx.status!=='approved')return {status:'unavailable'};
  if(tx.id!==claims.tx||tx.attemptId!==claims.aid||tx.attempt?.id!==claims.aid||tx.attempt?.action!==claims.act)return {status:'invalid'};
  const next={...tx,status:'exchanging'};return await transition(k,'approved',next)?{status:'claimed',transaction:frozen(next)}:{status:'unavailable'};
 }
 async function completeTransaction(id:string,status:string){if(!['consumed','failed'].includes(status))throw new Error('INVALID_STATUS');const aid=id.split('--')[0],k=transactionKey(aid,id),tx=await readRecord(k);if(!tx||tx.status!=='exchanging')return null;const next={...tx,status};return await transition(k,'exchanging',next)?frozen(next):null;}
 return {createAttempt,claimAttempt,rejectAttempt,approveAttempt,createSignedState,claimTransaction,completeTransaction};
}
