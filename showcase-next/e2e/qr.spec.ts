import {test,expect} from '@playwright/test';
test('desktop QR receives callback from independent phone browser session',async({page,browser})=>{
 await page.goto('/auth/login#login');await page.getByRole('button',{name:'IP',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();
 const link=page.getByTestId('qr-auth-link');const url=await link.getAttribute('href');expect(url).toContain('-qrcode');
 const phone=await browser.newContext();try{const phonePage=await phone.newPage();await phonePage.goto(url!);await expect(phonePage.getByRole('heading',{name:'Success',exact:true})).toBeVisible();await expect(page).toHaveURL(/\/user\/info$/);await expect(page.locator('pre')).toContainText('browser-user');}finally{await phone.close();}
});
