import { redirect } from 'next/navigation';
import { isInstalled } from '@/lib/install.mjs';

export const dynamic = 'force-dynamic';

export default async function Home() { redirect((await isInstalled()) ? '/admin' : '/install'); }
