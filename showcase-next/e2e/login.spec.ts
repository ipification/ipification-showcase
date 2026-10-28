import {test,expect} from '@playwright/test';
test('configured flow tabs and preferences survive refresh without Bootstrap',async({page})=>{
 await page.goto('/auth/login');await expect(page.getByRole('tab',{name:'PNV',exact:true})).toBeVisible();await page.getByRole('tab',{name:'Login',exact:true}).click();await expect(page).toHaveURL(/#login$/);await page.reload();await expect(page.getByRole('tab',{name:'Login',exact:true})).toHaveAttribute('aria-selected','true');
 expect(await page.locator('script[src*="jquery"],link[href*="bootstrap"]').count()).toBe(0);
});
