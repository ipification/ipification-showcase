import {readBody} from '@/server/http/body';
import {getUserInfo} from '@/server/store/auth-results';
import {json,unavailable} from '@/server/http/response';
export async function POST(request:Request){try{const body=await readBody(request);const user=await getUserInfo(body.state);return user?json(user):new Response(null,{status:401});}catch{return unavailable();}}
