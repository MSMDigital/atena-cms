import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth.mjs';
import { isSameOrigin, isAdminHost } from '@/lib/origin.mjs';
import { confirmPassword } from '@/lib/sessions.mjs';
import { installTemplateZip, LIMITS } from '@/lib/template-install.mjs';
import { uploadEnabled, activeTemplateId } from '@/lib/template.mjs';
import { contentCompat } from '@/lib/template-switch.mjs';
import { withLock } from '@/lib/db.mjs';
import crypto from 'node:crypto';
import { audit } from '@/lib/audit.mjs';
import { getT, loc } from '@/lib/i18n-server.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Caricamento di un template (zip). Solo admin, con conferma della password: un template contiene codice che produce l'HTML del sito
// (gira in un processo isolato, ma resta un'operazione delicata).
export async function POST(req) {
  if (!isAdminHost(req.headers)) return new Response('Non trovato', { status: 404 });   // il middleware non vede questa route (vedi middleware.js)
  const t = await getT();
  const fail = (error, status, details = []) => NextResponse.json({ ok: false, error, details }, { status });
  const user = await currentUser();
  if (!user) return fail(t('Sessione scaduta: accedi di nuovo.'), 401);
  if (user.role !== 'admin') return fail(t('Solo un admin può installare template.'), 403);
  if (!uploadEnabled()) return fail(t('Il caricamento dei template è disattivato su questo server (ALLOW_TEMPLATE_UPLOAD=0).'), 403);
  if (!isSameOrigin(req.headers)) return fail(t('Richiesta non consentita.'), 403);
  const declared = +req.headers.get('content-length');
  if (!declared) return fail(t('Richiesta non valida (manca la dimensione).'), 411);
  if (declared > LIMITS.zipBytes + 64 * 1024) return fail(t('Il file supera {n} MB.', { n: Math.round(LIMITS.zipBytes / 1048576) }), 413);

  let form;
  try { form = await req.formData(); } catch { return fail(t('Richiesta non valida.'), 400); }
  const file = form.get('file');
  if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function') return fail(t('Nessun file ricevuto.'), 400);
  const ok = await confirmPassword(user.id, form.get('password'));
  if (!ok.ok) { await audit(user.id, 'template.install.refused', 'conferma della password non riuscita'); return fail((await loc({ error: ok.error })).error, 403); }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const digest = crypto.createHash('sha256').update(bytes).digest('hex');
    await audit(user.id, 'template.install.attempt', `${String(file.name).slice(0, 60)} sha256:${digest.slice(0, 16)}`);   // prima dell'esecuzione: resta traccia anche se qualcosa va storto
    const run = await withLock('cms-template', () => installTemplateZip(bytes, {
      allowSameVersion: form.get('again') === '1',
      // Aggiornare il template ATTIVO: i contenuti attuali devono restare validi con la versione nuova.
      precheck: async (manifest, staged) => {
        if (manifest.id !== activeTemplateId()) return null;
        const c = await contentCompat(staged);
        return c.errors.length ? { error: 'I contenuti attuali non sono compatibili con questa versione del template attivo.', details: c.errors.slice(0, 20) } : null;
      },
    }), 0);
    if (!run.ok) return fail(t('Un\'altra operazione sui template è in corso: riprova tra un momento.'), 409);
    const r = run.value;
    await audit(user.id, r.ok ? 'template.install' : 'template.install.failed', r.ok ? `${r.manifest.id}@${r.manifest.version} sha256:${digest.slice(0, 16)}` : `${String(file.name).slice(0, 60)}: ${r.error}`);
    return NextResponse.json(r.ok ? { ok: true, manifest: r.manifest, warnings: (await loc({ warnings: r.warnings })).warnings, upgradedFrom: r.upgradedFrom, smoke: r.smoke } : { ok: false, ...(await loc({ error: r.error, details: r.details })) }, { status: r.ok ? 200 : 422 });
  } catch (e) {
    console.error('install template', e);
    return fail(t('Errore imprevisto durante l\'installazione.'), 500);
  }
}
