import {spawn} from 'node:child_process';
const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,NODE_ENV:'production'},stdio:'inherit'});
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>child.kill(signal));
child.once('exit',code=>process.exit(code??0));
