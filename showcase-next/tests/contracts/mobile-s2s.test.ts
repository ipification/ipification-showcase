import {test,expect} from 'vitest';
import {startApp,freePort} from '../helpers/processes';
import {startProvider} from '../helpers/provider';
import {configFixture} from '../helpers/config';
test('mobile exchanges submitted redirect URI, preserves userinfo precedence and creates no session',async()=>{
 const provider=await startProvider();provider.behavior.userInfo={auth_server:'provider-value',sub:'fixture'};
 const config=configFixture({auth_servers:[{id:'stage',url:provider.url}]});const port=await freePort();const app=await startApp({PORT:String(port),NODE_CONFIG_DIR:config.dir,APP_ORIGIN:`http://127.0.0.1:${port}`});
 try{const response=await fetch(app.url+'/auth/mobile/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({client_id:'fixture-client',code:'mobile-code',redirect_uri:'demo://callback'})});expect(response.status).toBe(200);expect(await response.json()).toEqual({auth_server:'provider-value',sub:'fixture'});expect(response.headers.get('set-cookie')).toBeNull();expect(provider.calls[0].body.redirect_uri).toBe('demo://callback');
 }finally{await app.stop();config.remove();await provider.stop();}
});
