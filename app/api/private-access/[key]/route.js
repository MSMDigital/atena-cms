import { NextResponse } from 'next/server';
import { isAllowedOrigin, readBodyLimited, ipFrom } from '@/lib/forms.mjs';
import { UNKNOWN_IP } from '@/lib/sessions.mjs';
import { isSecureDeployment } from '@/lib/auth.mjs';
import { verifyPageAccess, checkGateCookie, signGateCookie, gateCookieName, renderProtectedPage } from '@/lib/page-access.mjs';

// Riceve la verifica della password di una pagina protetta e serve il suo contenuto reale, solo dopo lo sblocco.
// Il sito è statico: queste richieste arrivano qui come quelle dei moduli (vedi app/api/forms/[id]/route.js), stessa
// gestione dell'origine se il sito è pubblicato su un dominio diverso da quello dell'admin.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const cors = (req) => {
  const origin = req.headers.get('origin');
  return origin && isAllowedOrigin(origin, req.headers.get('host'))
    ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Max-Age': '600', Vary: 'Origin' }
    : { Vary: 'Origin' };
};

export async function OPTIONS(req) {
  return new NextResponse(null, { status: 204, headers: cors(req) });
}

// Già sbloccata (cookie firmato valido per l'hash corrente)? Restituisce la pagina reale, mai altrimenti.
export async function GET(req, { params }) {
  const { key } = await params;
  const headers = { ...cors(req), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  try {
    const token = req.cookies.get(gateCookieName(key))?.value;
    const check = await checkGateCookie(key, token);
    if (!check.ok) return NextResponse.json({ ok: false }, { status: 401, headers });
    const html = await renderProtectedPage(key);
    if (!html) return NextResponse.json({ ok: false }, { status: 404, headers });
    return new NextResponse(html, { status: 200, headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex' } });
  } catch (e) {
    console.error('private-access GET', JSON.stringify(String(key).slice(0, 64)), e?.message);
    return NextResponse.json({ ok: false }, { status: 500, headers });
  }
}

// Verifica la password e, se corretta, firma il cookie di sblocco (stesso limite di tentativi dell'accesso admin).
export async function POST(req, { params }) {
  const { key } = await params;
  const headers = { ...cors(req), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  try {
    const body = await readBodyLimited(req, 2000);
    if (body == null) return NextResponse.json({ ok: false, reason: 'invalid' }, { status: 413, headers });
    let password = '';
    try { password = JSON.parse(body || '{}')?.password ?? ''; } catch { return NextResponse.json({ ok: false, reason: 'invalid' }, { status: 400, headers }); }
    const ip = ipFrom(req.headers) ?? UNKNOWN_IP;
    const r = await verifyPageAccess(key, password, ip);
    if (!r.ok) {
      const status = r.reason === 'locked' ? 429 : r.reason === 'busy' ? 503 : 401;
      return NextResponse.json({ ok: false, reason: r.reason }, { status, headers });
    }
    const signed = signGateCookie(key, r.hash);
    if (!signed) return NextResponse.json({ ok: false, reason: 'unset' }, { status: 500, headers });
    const res = NextResponse.json({ ok: true }, { status: 200, headers });
    res.cookies.set(gateCookieName(key), signed.token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: signed.maxAge, secure: isSecureDeployment() });
    return res;
  } catch (e) {
    console.error('private-access POST', JSON.stringify(String(key).slice(0, 64)), e?.message);
    return NextResponse.json({ ok: false, reason: 'invalid' }, { status: 500, headers });
  }
}
