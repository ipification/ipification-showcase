import {Server} from 'socket.io';
import {createClient} from 'redis';
import {createAdapter} from '@socket.io/redis-adapter';
export async function startSocketServer(httpServer,{redisUrl,adapterKey}){
 const pub=createClient({url:redisUrl,socket:{connectTimeout:3000,reconnectStrategy:retries=>Math.min(1000,100+retries*100)}});
 const sub=pub.duplicate();pub.on('error',()=>{});sub.on('error',()=>{});
 await Promise.all([pub.connect(),sub.connect()]);
 const io=new Server(httpServer);io.adapter(createAdapter(pub,sub,{key:adapterKey}));
 io.on('connection',socket=>{
  socket.emit('messages',{event_name:'connected',socket_id:socket.id});
  socket.on('init',(data,ack)=>{if(!data||typeof data.state!=='string'||!data.state||data.state.length>512)return;socket.join(`auth:${data.state}`);if(typeof ack==='function')ack({joined:true});});
 });
 return {ready:()=>pub.isReady&&sub.isReady,async close(){await new Promise(resolve=>io.close(resolve));await Promise.all([pub.close(),sub.close()]);}};
}
