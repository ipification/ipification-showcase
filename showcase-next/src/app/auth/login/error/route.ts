import {consumeSessionError} from '@/server/session/store';
import {sessionId} from '@/server/session/cookies';
import {json,unavailable} from '@/server/http/response';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{return json({error_message:await consumeSessionError(sessionId(request))});}catch{return unavailable();}}
