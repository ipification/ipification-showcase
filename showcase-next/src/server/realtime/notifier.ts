import 'server-only';
import {Emitter} from '@socket.io/redis-emitter';
import {getRedis,key} from '@/server/store/redis';
export async function notifyAuthComplete(state:string,url:string){const redis=await getRedis();if(!redis.isReady)throw new Error('REALTIME_UNAVAILABLE');new Emitter(redis,{key:key('socket.io')}).to(`auth:${state}`).emit('messages',{event_name:'url',url});}
