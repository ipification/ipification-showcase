import {test,expect} from 'vitest';
import {startApp} from '../helpers/processes';
import {configFixture} from '../helpers/config';
test('mounted configuration is redacted and geoip retains fallback country',async()=>{
 const config=configFixture({default_country_code:'vn'});
 const app=await startApp({NODE_CONFIG_DIR:config.dir,APP_ORIGIN:'https://canonical.example'});
 try{
 const r=await fetch(app.url+'/api/config');expect(r.status,r.status===200?'':await r.text()+app.output()).toBe(200);const data=await r.json();
 expect(data.clients[0].client_id).toBe('fixture-client');expect(data.clients[0].redirect_uri).toBe('https://canonical.example/auth/callback/pvn_ip');expect(JSON.stringify(data)).not.toContain('fixture-secret');
 const geo=await (await fetch(app.url+'/api/geoip')).json();expect(geo.country).toBe('vn');
 }finally{await app.stop();config.remove();}
});
