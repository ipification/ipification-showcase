import 'server-only';
import {createClient} from 'redis';
function newClient(url:string){return createClient({url,socket:{connectTimeout:3000,reconnectStrategy:retries=>retries>5?new Error('REDIS_UNAVAILABLE'):Math.min(1000,100+retries*100)},disableOfflineQueue:true});}
type Client=ReturnType<typeof newClient>;
const clients=new Map<string,Promise<Client>>();
export function key(suffix:string){return (process.env.SHOWCASE_KEY_PREFIX||'showcase-next:development:')+suffix;}
export async function getRedis():Promise<Client>{
 const url=process.env.REDIS_URL;if(!url)throw new Error('REDIS_UNAVAILABLE');
 const existing=clients.get(url);if(existing)return existing;
 const pending=(async()=>{const client=newClient(url);client.on('error',()=>{});await client.connect();return client;})();
 clients.set(url,pending);pending.catch(()=>clients.delete(url));return pending;
}
export async function closeRedis(){for(const p of clients.values()){try{(await p).destroy();}catch{}}clients.clear();}
