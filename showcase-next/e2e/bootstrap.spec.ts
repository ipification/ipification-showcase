import {test,expect} from '@playwright/test';
test('login page is served',async({page})=>{await page.goto('/auth/login');await expect(page.getByRole('heading',{name:'IPification Showcase'})).toBeVisible();});
