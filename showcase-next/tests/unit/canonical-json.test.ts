import {test,expect} from 'vitest';
import {canonicalJson,createRequestHash} from '@/server/shared/canonical-json';
test('canonical payload rejects ambiguous inputs and hashes sorted nested JSON',()=>{expect(canonicalJson({b:1,a:{z:2,c:3}})).toBe('{"a":{"c":3,"z":2},"b":1}');expect(createRequestHash('A',{b:1,a:2})).toBe(createRequestHash('A',{a:2,b:1}));expect(()=>canonicalJson({x:NaN})).toThrow();});
