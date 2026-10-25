import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth.mjs';
import { canWrite, ownsMedia } from '@/lib/permissions.mjs';
import { one } from '@/lib/db.mjs';
import { isSameOrigin, isAdminHost } from '@/lib/origin.mjs';
import { getT, loc } from '@/lib/i18n-server.mjs';
import { saveUpload, replaceUpload, UploadError, maxUploadBytes } from '@/lib/media.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';


// Un file per richiesta (multipart, campo "file"). Il tipo si riconosce dal contenuto, non da nome o Content-Type.
export async function POST(req) {
  if (!isAdminHost(req.headers)) return new Response('Non trovato', { status: 404 });   // il middleware non vede questa route (vedi middleware.js)
  const t = await getT();
  const fail = (error, status) => NextResponse.json({ ok: false, error }, { status });
  const user = await currentUser();
  if (!user) return fail(t('Sessione scaduta: accedi di nuovo.'), 401);
  if (!canWrite(user)) return fail(t('Non hai i permessi per caricare immagini.'), 403);
  if (!isSameOrigin(req.headers)) return fail(t('Richiesta non consentita.'), 403);
  // Serve la dimensione dichiarata: senza (trasferimento a pezzi) formData() caricherebbe tutto in memoria prima di poter dire di no.
  const declared = +req.headers.get('content-length');
  if (!declared) return fail(t('Richiesta non valida (manca la dimensione).'), 411);
  if (declared > maxUploadBytes() + 64 * 1024) return fail(t('Il file supera {n} MB.', { n: Math.round(maxUploadBytes() / 1048576) }), 413);

  let file; let replace = null;
  try { const form = await req.formData(); file = form.get('file'); replace = form.get('replace'); } catch { return fail(t('Richiesta non valida.'), 400); }
  if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function') return fail(t('Nessun file ricevuto.'), 400);
  if (file.size > maxUploadBytes()) return fail(t('Il file supera {n} MB.', { n: Math.round(maxUploadBytes() / 1048576) }), 413);

  try {
    if (typeof replace === 'string' && replace && !ownsMedia(user, await one('SELECT source, uploaded_by FROM media WHERE path = ?', [replace]))) return fail(t('Puoi sostituire solo le immagini che hai caricato tu.'), 403);
    const buf = Buffer.from(await file.arrayBuffer());
    const item = typeof replace === 'string' && replace ? await replaceUpload(replace, buf, file.name, user.id) : await saveUpload(buf, file.name, user.id);   // `replace`: percorso dell'immagine da sostituire
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    if (e instanceof UploadError) return fail((await loc({ error: e.message })).error, 422);
    console.error('upload media', e);
    return fail(t('Errore imprevisto durante il caricamento.'), 500);
  }
}
