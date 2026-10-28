import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {readSession} from '@/server/session/store';
import {ResultView} from '@/features/results/result-view';
export const dynamic='force-dynamic';
export default async function Info(){const id=(await cookies()).get('showcase_next_sid')?.value||'';const session=await readSession(id);if(!session?.isAuthenticated||!session.userData)redirect('/');return <ResultView result={session.userData}/>;}
