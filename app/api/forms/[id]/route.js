import { handleSubmission, readBodyLimited, isAllowedOrigin } from '@/lib/forms.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Riceve le richieste dei moduli del sito pubblicato. Il sito è statico: se sta su un indirizzo diverso da quello dell'admin
// (APP_ORIGIN o FORM_ALLOWED_ORIGINS) il browser chiede prima il permesso (OPTIONS).
const cors = (req) => {
  const origin = req.headers.get('origin');
  return origin && isAllowedOrigin(origin, req.headers.get('host'))
    ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600', Vary: 'Origin' }
    : { Vary: 'Origin' };
};
const json = (req, status, body) => Response.json(body, { status, headers: { ...cors(req), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

export async function OPTIONS(req) {
  return new Response(null, { status: 204, headers: cors(req) });
}

export async function POST(req, { params }) {
  const { id } = await params;
  try {
    const body = await readBodyLimited(req);
    const r = await handleSubmission({ id, body, headers: req.headers });
    return json(req, r.status, r.json);
  } catch (e) {
    console.error('modulo', JSON.stringify(String(id).slice(0, 64)), e?.message);
    return json(req, 500, { ok: false, error: 'Errore imprevisto: riprova o chiamaci.' });
  }
}
