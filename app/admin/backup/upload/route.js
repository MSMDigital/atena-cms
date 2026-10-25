import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth.mjs';
import { isSameOrigin, isAdminHost } from '@/lib/origin.mjs';
import { loc } from '@/lib/i18n-server.mjs';
import { receivePackage } from '@/lib/backup.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const fail = async (error, status) => NextResponse.json(await loc({ ok: false, error }), { status });

// Carica un pacchetto di backup in data/restore (solo admin). Il file è il corpo della richiesta (si legge in streaming, mai tutto in memoria);
// il nome sta nell'intestazione x-filename. Il ripristino vero è un passo a parte, con conferma.
export async function POST(req) {
  if (!isAdminHost(req.headers)) return new Response('Non trovato', { status: 404 });   // il middleware non vede questa route (vedi middleware.js)
  const user = await currentUser();
  if (!user || user.role !== 'admin') return await fail('Non autorizzato.', 401);
  if (!isSameOrigin(req.headers)) return await fail('Richiesta non consentita.', 403);
  if (!req.body) return await fail('Nessun file ricevuto.', 400);
  try {
    const r = await receivePackage(req.body, decodeURIComponent(req.headers.get('x-filename') ?? ''), +req.headers.get('content-length') || 0);
    return NextResponse.json({ ok: true, name: r.name, size: r.size, createdAt: r.manifest.createdAt });
  } catch (e) { return await fail(String(e.message).slice(0, 300), 422); }
}
