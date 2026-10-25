import { NextResponse } from 'next/server';
import { isInstalled, checkInstallToken } from '@/lib/install.mjs';
import { isSameOrigin, isAdminHost } from '@/lib/origin.mjs';
import { installTemplateZip, LIMITS } from '@/lib/template-install.mjs';
import { uploadEnabled } from '@/lib/template.mjs';
import { makeT, localize } from '@/lib/i18n.mjs';
import { EN } from '@/lib/i18n/en.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// La lingua la sceglie il visitatore nel wizard (il database può non esserci ancora) e arriva nell'intestazione x-lang.
const fail = (error, status, t, details = []) => NextResponse.json({ ok: false, error: t(error), details }, { status });

// Durante l'installazione: caricamento di un template (zip). Serve la chiave di installazione; dopo l'installazione la pagina è chiusa.
export async function POST(req) {
  if (!isAdminHost(req.headers)) return new Response('Non trovato', { status: 404 });   // il middleware non vede questa route (vedi middleware.js)
  const t = makeT(req.headers.get('x-lang'), EN);
  if (await isInstalled()) return fail('Il CMS è già installato.', 404, t);
  if (!isSameOrigin(req.headers)) return fail('Richiesta non consentita.', 403, t);
  // La chiave si controlla PRIMA di leggere il corpo: un anonimo non deve poter far caricare in memoria decine di MB.
  const c = checkInstallToken(req.headers.get('x-install-token'));
  if (!c.ok) return fail(c.error, 403, t);
  if (!uploadEnabled()) return fail('Il caricamento dei template è disattivato su questo server (ALLOW_TEMPLATE_UPLOAD=0): copia la cartella del template in templates/.', 403, t);
  const declared = +req.headers.get('content-length');
  if (!declared) return fail('Richiesta non valida (manca la dimensione).', 411, t);
  if (declared > LIMITS.zipBytes + 64 * 1024) return fail(t('Il file supera {mb} MB.', { mb: Math.round(LIMITS.zipBytes / 1048576) }), 413, t);
  let form;
  try { form = await req.formData(); } catch { return fail('Richiesta non valida.', 400, t); }
  const file = form.get('file');
  if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function') return fail('Nessun file ricevuto.', 400, t);
  try {
    const r = await installTemplateZip(Buffer.from(await file.arrayBuffer()), { allowSameVersion: true });
    return NextResponse.json(r.ok ? { ok: true, manifest: r.manifest, warnings: localize({ warnings: r.warnings }, t).warnings } : localize({ ok: false, error: r.error, details: r.details }, t), { status: r.ok ? 200 : 422 });
  } catch (e) { console.error('install template (setup)', e); return fail('Errore imprevisto durante l\'installazione del template.', 500, t); }
}
