import { expect,test } from 'vitest';
import { startApp } from '../helpers/processes';
test('custom server serves Next pages, legacy root redirect and not-found',async()=>{
 const app=await startApp();try {
  const root=await fetch(app.url,{redirect:'manual'});expect(root.status).toBe(302);expect(root.headers.get('location')).toBe('/auth/login');
  const login=await fetch(app.url+'/auth/login');expect(login.status).toBe(200);expect(login.headers.get('content-type')).toContain('text/html');
  expect((await fetch(app.url+'/missing-page')).status).toBe(404);
 }finally{await app.stop();}
});
