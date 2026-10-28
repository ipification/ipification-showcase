import type {ServerConfig} from '../src/server/config/load';
export function initializeConfigEnvironment(options?:{appRoot?:string;dev?:boolean}):void;
export function loadRuntimeConfig():ServerConfig;
export function validateFeatureEnvironment():void;
export function deepMerge<T>(target:T,source?:Partial<T>):T;
export class ConfigurationError extends Error{}
