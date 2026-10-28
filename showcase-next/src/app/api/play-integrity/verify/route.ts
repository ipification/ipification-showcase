import {handleIntegrity} from '@/server/integrity/handlers';
export const runtime='nodejs';
export async function POST(request:Request){return handleIntegrity(request,'verify');}
