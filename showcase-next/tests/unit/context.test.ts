import {expect,test} from 'vitest';
import {resolveRequestIdentity} from '@/server/http/context';
import {readBody} from '@/server/http/body';
test('canonical origin differs from trusted incoming verification hostname',()=>{
 expect(resolveRequestIdentity(new Request('http://internal:3002/',{headers:{'x-forwarded-host':'Verify.Example:443','x-forwarded-proto':'https','x-forwarded-for':'203.0.113.7'}}),{origin:'https://canonical.example',trustProxyHops:1})).toEqual({origin:'https://canonical.example',hostname:'verify.example',clientIp:'203.0.113.7'});
 expect(resolveRequestIdentity(new Request('http://localhost/',{headers:{'x-forwarded-host':'attacker.invalid','x-forwarded-for':'spoof'}}),{trustProxyHops:0}).hostname).toBe('localhost');
});
test('body reader accepts forms and rejects streamed oversize without trusting content length',async()=>{
 expect(await readBody(new Request('http://test',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'state=a&state=b'}),1024)).toEqual({state:['a','b']});
 await expect(readBody(new Request('http://test',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({x:'a'.repeat(16384)})}),16384)).rejects.toThrow('INVALID_REQUEST');
});
