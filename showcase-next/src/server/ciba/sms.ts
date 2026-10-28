import * as provider from './provider';
export const startAuthentication=(input:any)=>provider.startAuthentication('sms',input);
export const exchangeToken=(input:any)=>provider.exchangeToken('sms',input);
