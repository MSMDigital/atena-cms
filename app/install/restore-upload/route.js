import { NextResponse } from 'next/server';
import { isInstalled, checkInstallToken } from '@/lib/install.mjs';
import { isSameOrigin, isAdminHost } from '@/lib/origin.mjs';
import { receivePackage } from '@/lib/backup.mjs';
import { makeT, localize } from '@/lib/i18n.mjs';
import { EN } from '@/lib/i18n/en.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// La lingua la sceglie il visitatore nel wizard (il database può non esserci ancora) e arriva nell'intestazione x-lang.
const fail = (error, status, t) => NextResponse.json({ ok: false, error: t(error) }, { status });

// Carica un pacchetto di backup durante l'installazione (serve la chiave di installazione, come per ogni passo; si spegne a installazione finita).
export async function POST(req) {
  if (!isAdminHost(req.headers)) return new Response('Non trovato', { status: 404 });   // il middleware non vede questa route (vedi middleware.js)
  const t = makeT(req.headers.get('x-lang'), EN);
  if (await isInstalled()) return fail('Il CMS è già installato.', 403, t);
  if (!isSameOrigin(req.headers)) return fail('Richiesta non consentita.', 403, t);
  const c = checkInstallToken(req.headers.get('x-install-token') ?? '');
  if (!c.ok) return fail(c.error ?? 'Chiave di installazione non valida.', 401, t);
  if (!req.body) return fail('Nessun file ricevuto.', 400, t);
  try {
    const r = await receivePackage(req.body, decodeURIComponent(req.headers.get('x-filename') ?? ''), +req.headers.get('content-length') || 0);
    return NextResponse.json({ ok: true, name: r.name, size: r.size, createdAt: r.manifest.createdAt });
  } catch (e) { return fail(String(e.message).slice(0, 300), 422, t); }
}
