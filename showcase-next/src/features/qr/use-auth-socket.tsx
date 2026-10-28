'use client';
import {useEffect,useState} from 'react';
import {io} from 'socket.io-client';
export function useAuthSocket({enabled,state,onComplete}:{enabled:boolean;state:string;onComplete:(url:string)=>void}){
 const [ready,setReady]=useState(false);
 useEffect(()=>{
 if(!enabled||!state)return;
 let active=true;const socket=io({autoConnect:false});
 socket.on('connect',()=>socket.emit('init',{state},()=>{if(active)setReady(true);}));
 socket.on('disconnect',()=>{if(active)setReady(false);});
 socket.on('messages',message=>{if(!active||message.event_name!=='url'||typeof message.url!=='string')return;try{const url=new URL(message.url,location.origin);if(url.origin===location.origin&&url.pathname==='/auth/complete'&&url.searchParams.get('state')===state)onComplete(url.href);}catch{}});
 socket.connect();return()=>{active=false;socket.removeAllListeners();socket.disconnect();};
 },[enabled,state,onComplete]);
 return enabled&&ready;
}
