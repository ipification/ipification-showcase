'use client';
import {useEffect,useRef,useState} from 'react';
import {Alert,AlertDescription} from '@/components/ui/alert';
export function LoginError(){const [message,setMessage]=useState(''),started=useRef(false);useEffect(()=>{if(started.current)return;started.current=true;fetch('/auth/login/error',{cache:'no-store'}).then(r=>r.json()).then(data=>{if(data.error_message)setMessage(data.error_message);}).catch(()=>{});},[]);return message?<Alert variant="destructive"><AlertDescription>{message}</AlertDescription></Alert>:null;}
