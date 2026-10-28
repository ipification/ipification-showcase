'use client';
import {useEffect,useRef} from 'react';
import type {Country,Iso2} from 'intl-tel-input';
import {Label} from '@/components/ui/label';
export interface PhoneValue{number:string;valid:boolean;country:string}
export function PhoneInput({country='rs',disabledCountrySelection=false,appEnv,onChange}:{country?:string;disabledCountrySelection?:boolean;appEnv:string;onChange:(value:PhoneValue)=>void}){
 const ref=useRef<HTMLInputElement>(null),change=useRef(onChange);
 useEffect(()=>{change.current=onChange;},[onChange]);
 useEffect(()=>{
 let dispose:undefined|(()=>void),cancelled=false;
 import('intl-tel-input').then(({default:intlTelInput})=>{
  if(cancelled||!ref.current)return;
  if(appEnv==='stage'&&!intlTelInput.getAllCountries().some(c=>c.dialCode==='999'))intlTelInput.getAllCountries().push({name:'Wonderland',iso2:'ww' as Iso2,dialCode:'999',priority:0,areaCodes:null,nationalPrefix:null} as Country);
  const input=ref.current;const iti=intlTelInput(input,{initialCountry:(appEnv==='stage'?'ww':country) as Iso2,countrySelectorMode:disabledCountrySelection?'OFF':'AUTO',countryNameOverrides:appEnv==='stage'?{ww:'Wonderland'} as any:{},countrySearch:!disabledCountrySelection,separateDialCode:true,loadUtils:()=>import('intl-tel-input/utils'),customPlaceholder:(placeholder,data)=>data?.dialCode==='999'?'123456789':placeholder});
  const update=()=>{const selected=iti.getSelectedCountry();if(!selected)return;change.current({number:(selected.dialCode==='999'?'999'+input.value.replace(/\D/g,''):(iti.getNumber()||'').replace(/[ +]/g,'')),valid:selected.dialCode==='999'?!!input.value.trim():!!iti.isValidNumber(),country:selected.iso2||country});};
  input.addEventListener('input',update);input.addEventListener('countrychange',update);iti.promise.then(()=>{if(!cancelled)update();});
  dispose=()=>{input.removeEventListener('input',update);input.removeEventListener('countrychange',update);iti.destroy();};
 });
 return()=>{cancelled=true;dispose?.();};
 },[country,appEnv,disabledCountrySelection]);
 return <div className="space-y-2"><Label htmlFor="showcase-phone">Phone number</Label><input ref={ref} id="showcase-phone" type="tel" autoComplete="tel" className="h-12 w-full rounded-lg border bg-white px-3 text-base outline-none focus:ring-2 focus:ring-primary"/></div>;
}
