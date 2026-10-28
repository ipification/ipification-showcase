'use client';
import {useState,useEffect} from 'react';
import type {Tab} from '@/shared/flow-catalog';
export function usePreferences(tabs:Tab[],servers:string[]){
 const [tab,setTab]=useState<Tab>(tabs[0]||'pnv'),[serverId,setServerId]=useState(servers[0]||'');
 useEffect(()=>{
  const read=()=>{let savedTab='',savedServer='';try{savedTab=localStorage.getItem('selector')||'';savedServer=localStorage.getItem('selected_auth_server_id')||'';}catch{}
   const hash=location.hash.slice(1);const selected=tabs.includes(hash as Tab)?hash:tabs.includes(savedTab as Tab)?savedTab:tabs[0];if(selected)setTab(selected as Tab);if(servers.includes(savedServer))setServerId(savedServer);
  };queueMicrotask(read);window.addEventListener('hashchange',read);return()=>window.removeEventListener('hashchange',read);
 },[tabs,servers]);
 function selectTab(value:Tab){setTab(value);history.replaceState(null,'','#'+value);try{localStorage.setItem('selector',value);}catch{}}
 function selectServer(value:string){setServerId(value);try{localStorage.setItem('selected_auth_server_id',value);}catch{}}
 return {tab,serverId,selectTab,selectServer};
}
