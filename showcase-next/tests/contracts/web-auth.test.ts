import {test,expect} from 'vitest';
import {startApp,freePort} from '../helpers/processes';
import {startRedis} from '../helpers/redis';
import {startProvider} from '../helpers/provider';
import {configFixture} from '../helpers/config';
test('web callbacks retain 302, QR/backchannel order, independent session and S2S results',async()=>{
 const redis=await startRedis(),provider=await startProvider();const config=configFixture({auth_servers:[{id:'stage',url:provider.url}]});const port=await freePort(),origin=`http://127.0.0.1:${port}`;
 const app=await startApp({PORT:String(port),NODE_CONFIG_DIR:config.dir,APP_ORIGIN:origin,REDIS_URL:redis.url});
 const get=(path:string,options:RequestInit={})=>fetch(origin+path,{redirect:'manual',...options});
 try{
 const start=await get('/auth/start?user_flow=pvn_ip&state=abc');expect(start.status).toBe(302);expect(new URL(start.headers.get('location')!).searchParams.get('redirect_uri')).toBe(origin+'/auth/callback/pvn_ip/stage');
 const cb=await get('/auth/callback/pvn_ip/stage?code=fixture-code&state=abc');expect(cb.status).toBe(302);expect(cb.headers.get('location')).toBe(origin+'/auth/complete?state=abc');expect(provider.calls.map(c=>c.operation)).toEqual(['token','userinfo']);
 const complete=await get('/auth/complete?state=abc');expect(complete.status).toBe(302);expect(complete.headers.get('location')).toBe('/user/info');const cookie=complete.headers.get('set-cookie')!.split(';')[0];
 expect((await get('/user/info',{headers:{cookie}})).status).toBe(200);expect((await get('/user/info')).headers.get('location')).toBe('/');
 const s2s=await get('/auth/s2s/signin',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({state:'abc'})});expect(s2s.status).toBe(200);expect(await s2s.json()).toEqual(provider.behavior.userInfo);
 const back=await get('/auth/callback/pvn_ip/stage?code=c&state=abc-qrcode',{headers:{'ip-backchannel-im-auth':'true'}});expect(back.status).toBe(200);expect(await back.text()).toBe('');
 provider.behavior.userInfo={phone_number_verified:'false'};expect((await get('/auth/callback/pvn_ip/stage?code=c&state=qr-qrcode')).headers.get('location')).toBe('/auth/qrcode/error');
 provider.behavior.userInfo={phone_number_verified:false};expect((await get('/auth/callback/pvn_ip/stage?code=c&state=qr2-qrcode')).headers.get('location')).toBe('/auth/qrcode/complete');
 }finally{await app.stop();config.remove();await provider.stop();await redis.stop();}
});
