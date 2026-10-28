import {test,expect} from 'vitest';
import {startRedis} from '../helpers/redis';
import {checkTs43Limit} from '@/server/store/rate-limit';
import {closeRedis} from '@/server/store/redis';
test('identity limit has shared atomic count and Retry-After',async()=>{
 const redis=await startRedis();process.env.REDIS_URL=redis.url;process.env.SHOWCASE_KEY_PREFIX='limit-test:';
 try{
 const results=await Promise.all(Array.from({length:6},()=>checkTs43Limit({clientIp:'203.0.113.1'},{client_id:'c',login_hint:'phone'})));
 expect(results.filter(r=>r.allowed)).toHaveLength(5);expect(results.find(r=>!r.allowed)?.headers['Retry-After']).toBeDefined();
 }finally{await closeRedis();await redis.stop();}
});
