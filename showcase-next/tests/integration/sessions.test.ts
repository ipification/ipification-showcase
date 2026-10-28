import {test,expect} from 'vitest';
import {startRedis} from '../helpers/redis';
import {createSession,readSession,consumeSessionError,deleteSession} from '@/server/session/store';
import {closeRedis} from '@/server/store/redis';
test('opaque sessions rotate, stay server-side and atomically consume errors',async()=>{
 const redis=await startRedis();process.env.REDIS_URL=redis.url;process.env.SHOWCASE_KEY_PREFIX='session-test:';
 try{
 const id=await createSession({isAuthenticated:false,errorMessage:'once'});expect(id).toMatch(/^[a-f0-9]{64}$/);
 const errors=await Promise.all([consumeSessionError(id),consumeSessionError(id)]);expect(errors.filter(Boolean)).toEqual(['once']);
 const next=await createSession({isAuthenticated:true,userData:{userInfo:{sub:'u'},state:'s',client_id:'c',client_title:'Phone'}},id);
 expect(await readSession(id)).toBeNull();expect((await readSession(next))?.isAuthenticated).toBe(true);expect(await redis.client.ttl('session-test:session:'+next)).toBeGreaterThan(3590);
 await deleteSession(next);expect(await readSession(next)).toBeNull();expect(await readSession('invalid')).toBeNull();
 }finally{await closeRedis();await redis.stop();}
});
