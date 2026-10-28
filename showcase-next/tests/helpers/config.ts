import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
export function configFixture(overrides:Record<string,unknown>={}){
 const dir=mkdtempSync(path.join(tmpdir(),'showcase-fixture-'));
 const data={realm:'demo',client_id:'fixture-client',client_secret:'fixture-secret',auth_servers:[{id:'stage',url:'http://127.0.0.1:19999'}],clients:[{user_flow:'pvn_ip',scope:'openid ip:phone_verify',title:'IP Phone Number Verification'},{user_flow:'login_ip',scope:'openid ip:phone',title:'IP Login'},{user_flow:'pvn_sms',scope:'openid',title:'SMS'}],...overrides};
 writeFileSync(path.join(dir,'default.json'),JSON.stringify(data));return {dir,data,remove:()=>rmSync(dir,{recursive:true,force:true})};
}
