import {defineConfig,devices} from '@playwright/test';
export default defineConfig({testDir:'./e2e',fullyParallel:false,workers:1,use:{baseURL:'http://127.0.0.1:3002',trace:'retain-on-failure'},projects:[{name:'chromium',use:{...devices['Desktop Chrome']}}],webServer:{command:'node tests/helpers/e2e-server.mjs',url:'http://127.0.0.1:3002/auth/login',reuseExistingServer:false,timeout:120000}});
