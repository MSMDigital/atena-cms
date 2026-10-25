import { authenticateApi } from '@/lib/api-tokens.mjs';
import { createApiPost } from '@/lib/api-posts.mjs';
import { ipFrom, readBodyLimited } from '@/lib/forms.mjs';
import { maxUploadBytes } from '@/lib/media.mjs';
import { isInstalled } from '@/lib/install.mjs';
import { isAdminHost } from '@/lib/origin.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// API per inviare un articolo IN BOZZA (mai pubblicato da qui). Autenticazione con un token «Bearer» creato da un admin in Impostazioni → API.
// Niente cookie e niente CORS: lo chiama un programma, non una pagina web (un browser non può usarla da un altro sito).
// Fuori dal middleware (vedi il matcher): Next ne copia in memoria il corpo e lo tronca; il limite di dimensione lo applica questa route.
//   POST /api/posts   Authorization: Bearer atn_…   Content-Type: application/json
//   { "title": "…", "text": "… (markdown semplice)", "image": { "data": "<base64>", "filename": "foto.jpg", "alt": "…" } }   (image è facoltativa)
const HEADERS = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (status, body, extra = {}) => Response.json(body, { status, headers: { ...HEADERS, ...extra } });

export async function POST(req) {
  try {
    if (!isAdminHost(req.headers) || !(await isInstalled())) return json(404, { ok: false, error: 'Non trovato.' });
    const ip = ipFrom(req.headers) ?? 'direct';
    const auth = await authenticateApi(req.headers.get('authorization'), ip);
    if (!auth.ok) {
      if (auth.reason === 'locked') return json(429, { ok: false, error: 'Troppi tentativi: riprova più tardi.' }, { 'Retry-After': '900' });
      return json(401, { ok: false, error: 'Non autorizzato.' }, { 'WWW-Authenticate': 'Bearer' });   // stessa risposta per token mancante, errato, scaduto o revocato
    }
    if (!/^application\/json(\s*;|$)/i.test(req.headers.get('content-type') ?? '')) return json(415, { ok: false, error: 'Content-Type deve essere application/json.' });
    const max = Math.ceil(maxUploadBytes() * 4 / 3) + 64 * 1024;   // immagine in base64 + testo
    const declared = +req.headers.get('content-length');
    if (!declared) return json(411, { ok: false, error: 'Manca Content-Length.' });
    if (declared > max) return json(413, { ok: false, error: 'Richiesta troppo grande.' });
    const raw = await readBodyLimited(req, max);
    if (raw == null) return json(413, { ok: false, error: 'Richiesta troppo grande.' });
    let body;
    try { body = JSON.parse(raw); } catch { return json(400, { ok: false, error: 'JSON non valido.' }); }

    const r = await createApiPost(body, auth.user);
    if (!r.ok) return json(r.status, { ok: false, error: r.error });
    return json(201, { ok: true, key: r.key, status: 'draft' });
  } catch (e) {
    console.error('api/posts', e?.message);
    return json(500, { ok: false, error: 'Errore imprevisto.' });
  }
}

// Gli altri metodi non esistono (nessun OPTIONS: nessun accesso da altri siti).
export const GET = () => json(405, { ok: false, error: 'Usa POST.' }, { Allow: 'POST' });
