import { NextResponse } from 'next/server';
import { isInstalled, checkInstallToken } from '@/lib/install.mjs';
import { isSameOrigin } from '@/lib/origin.mjs';
import { installTemplateZip, LIMITS } from '@/lib/template-install.mjs';
import { uploadEnabled } from '@/lib/template.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const fail = (error, status, details = []) => NextResponse.json({ ok: false, error, details }, { status });

// Durante l'installazione: caricamento di un template (zip). Serve la chiave di installazione; dopo l'installazione la pagina è chiusa.
export async function POST(req) {
  if (await isInstalled()) return fail('Il CMS è già installato.', 404);
  if (!isSameOrigin(req.headers)) return fail('Richiesta non consentita.', 403);
  // La chiave si controlla PRIMA di leggere il corpo: un anonimo non deve poter far caricare in memoria decine di MB.
  const t = checkInstallToken(req.headers.get('x-install-token'));
  if (!t.ok) return fail(t.error, 403);
  if (!uploadEnabled()) return fail('Il caricamento dei template è disattivato su questo server (ALLOW_TEMPLATE_UPLOAD=0): copia la cartella del template in templates/.', 403);
  const declared = +req.headers.get('content-length');
  if (!declared) return fail('Richiesta non valida (manca la dimensione).', 411);
  if (declared > LIMITS.zipBytes + 64 * 1024) return fail(`Il file supera ${Math.round(LIMITS.zipBytes / 1048576)} MB.`, 413);
  let form;
  try { form = await req.formData(); } catch { return fail('Richiesta non valida.', 400); }
  const file = form.get('file');
  if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function') return fail('Nessun file ricevuto.', 400);
  try {
    const r = await installTemplateZip(Buffer.from(await file.arrayBuffer()), { allowSameVersion: true });
    return NextResponse.json(r.ok ? { ok: true, manifest: r.manifest, warnings: r.warnings } : { ok: false, error: r.error, details: r.details }, { status: r.ok ? 200 : 422 });
  } catch (e) { console.error('install template (setup)', e); return fail('Errore imprevisto durante l\'installazione del template.', 500); }
}
