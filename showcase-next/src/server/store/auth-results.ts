import {getRedis,key} from './redis';
import type {DisplayResult,UserInfo} from '@/shared/contracts';
type Store={get:(key:string)=>Promise<any>;set:(key:string,value:any)=>Promise<unknown>};
export function createAuthResultStore(store:Store,delay:(ms:number)=>Promise<void>=ms=>new Promise(r=>setTimeout(r,ms))){
 return {
 async saveResult(state:string,result:DisplayResult,raw:UserInfo){await store.set(state,result);await store.set(`${state}-user-info`,raw);},
 async waitForResult(state?:string):Promise<DisplayResult|undefined>{for(let i=0;i<=4;i++){const value=await store.get(state||'');if(value)return value;await delay(1000);}return undefined;},
 async getUserInfo(state?:string):Promise<UserInfo|undefined>{return (await store.get(`${state}-user-info`))||undefined;}
 };
}
const store=createAuthResultStore({async get(id){const value=await(await getRedis()).get(key('result:'+id));return value?JSON.parse(value):null;},async set(id,value){await(await getRedis()).set(key('result:'+id),JSON.stringify(value),{PX:3600000});}});
export const {saveResult,waitForResult,getUserInfo}=store;
