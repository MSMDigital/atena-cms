// Prima barriera: senza cookie di sessione si va al login. La verifica vera (sessione valida nel database, ruolo) è nel server, pagina per pagina.
// In più, ogni pagina dell'admin riceve una Content-Security-Policy con un valore casuale (nonce) per richiesta: solo gli script di Next e i file
// dello stesso sito girano, quindi un <script> o un onerror="..." finito per errore in un contenuto (anche nell'anteprima, che eredita la politica)
// non viene eseguito. Gli stili "inline" restano ammessi (l'anteprima li usa per i colori dal vivo e l'editor per il punto focale).
import { NextResponse } from 'next/server';
import { adminSlug } from './lib/admin-path.mjs';

// Solo con `next dev`: il refresh automatico di React usa eval e un WebSocket. In produzione (next start) la politica resta stretta.
const DEV = process.env.NODE_ENV === 'development';

const policy = (nonce, sandbox = false) => [
  "default-src 'self'",
  `script-src 'self' 'nonce-${nonce}'${DEV ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob:",
  "frame-src 'self' https://www.google.com",       // la mappa, dopo il clic sul consenso, anche nell'anteprima
  DEV ? "connect-src 'self' ws: wss:" : "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  ...(sandbox ? ['sandbox allow-scripts'] : []),      // il documento dell'anteprima non ha l'origine dell'admin nemmeno se aperto da solo
].join('; ');

function withPolicy(req, sandbox = false, rewriteTo = null) {
  const nonce = btoa(crypto.randomUUID());
  const csp = policy(nonce, sandbox);
  const headers = new Headers(req.headers);
  headers.set('Content-Security-Policy', csp);      // Next legge il nonce da qui e lo mette sui propri script
  headers.set('x-nonce', nonce);
  const res = rewriteTo ? NextResponse.rewrite(new URL(rewriteTo, req.url), { request: { headers } }) : NextResponse.next({ request: { headers } });
  res.headers.set('Content-Security-Policy', csp);
  return res;
}

// Protezione temporanea di TUTTO il sito, utile in fase di test prima di andare online (SITE_PASSWORD nel .env del
// server, mai in git): finché è impostata, ogni richiesta deve passare l'autenticazione HTTP Basic del browser.
// Variabile assente o vuota: nessuna protezione, comportamento normale.
function checkSitePassword(req) {
  const pass = process.env.SITE_PASSWORD;
  if (!pass) return null;
  const user = process.env.SITE_PASSWORD_USER || 'preview';
  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Basic ')) {
    try {
      const [u, p] = atob(auth.slice(6)).split(':');
      if (u === user && p === pass) return null;
    } catch { /* intestazione malformata: trattata come assente */ }
  }
  return new NextResponse('Accesso riservato (sito in test).', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Sito in test"' } });
}

// Intestazioni che next.config.mjs dà a /admin/*: l'indirizzo di accesso personalizzato non le riceve da lì (il middleware gira dopo), quindi le aggiungiamo qui.
const ADMIN_HEADERS = {
  'X-Content-Type-Options': 'nosniff', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()', 'Cross-Origin-Opener-Policy': 'same-origin',
  'X-Frame-Options': 'SAMEORIGIN', 'Referrer-Policy': 'same-origin', 'Cache-Control': 'no-store',
};
const notFound = () => new NextResponse('Non trovato', { status: 404, headers: { 'Cache-Control': 'no-store' } });

export function middleware(req) {
  const blocked = checkSitePassword(req);
  if (blocked) return blocked;

  const { search } = req.nextUrl;
  let pathname = req.nextUrl.pathname;

  // Indirizzo di accesso personalizzato (Admin → Impostazioni → Accesso): /<indirizzo>/... è l'admin, riscritto internamente verso /admin/...
  // /admin/login non esiste per chi non ha già una sessione, e /admin/... senza sessione risponde «non trovato» invece di rimandare al login.
  const slug = adminSlug();
  let via = false;
  if (slug && (pathname === `/${slug}` || pathname.startsWith(`/${slug}/`))) { via = true; pathname = `/admin${pathname.slice(slug.length + 1)}`; }
  const direct = !via && (pathname === '/admin' || pathname.startsWith('/admin/'));
  const finish = (res) => { if (via) for (const [k, v] of Object.entries(ADMIN_HEADERS)) res.headers.set(k, v); return res; };
  const go = (sandbox = false) => finish(withPolicy(req, sandbox, via ? pathname + search : null));

  if (!(pathname.startsWith('/admin') || pathname.startsWith('/install'))) return NextResponse.next();   // sito pubblico e asset: solo la password sopra, nessun'altra regola

  // Admin e installazione solo dagli indirizzi indicati (ADMIN_HOSTS, separati da virgola): sul dominio del sito pubblico non devono esistere.
  // Così il JavaScript di un template servito dal sito non condivide l'origine dell'admin.
  const hosts = (process.env.ADMIN_HOSTS ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
  if (hosts.length && !hosts.includes((req.headers.get('host') ?? '').toLowerCase())) return new NextResponse('Non trovato', { status: 404 });
  if (pathname.startsWith('/install')) return withPolicy(req);   // l'installazione ha la sua protezione (chiave di installazione) e la stessa politica di sicurezza
  // I file dell'anteprima li carica un documento con origine opaca (senza cookie): la route decide da sé cosa è pubblico e cosa no.
  if (pathname.startsWith('/admin/preview-assets/') || pathname.startsWith('/admin/preview-fonts/')) return withPolicy(req);   // i font li serve la route (download solo con sessione o token)
  const session = req.cookies.get('cms_session');
  if (slug && direct && (!session || pathname === '/admin/login')) return notFound();
  if ((pathname === '/admin/preview' || pathname.startsWith('/admin/preview/')) && session) return go(true);   // documento dell'anteprima: sandbox
  // Senza sessione il documento dell'anteprima non si reindirizza al login: finirebbe una pagina dell'admin dentro un iframe sandboxed.
  if (pathname === '/admin/preview' || pathname.startsWith('/admin/preview/')) return new NextResponse('Non autorizzato', { status: 401 });
  if (pathname === '/admin/login' || session) return go();
  const url = req.nextUrl.clone();
  url.pathname = slug ? `/${slug}/login` : '/admin/login';
  url.search = '';
  if (pathname !== '/admin') url.searchParams.set('next', pathname + search);
  return NextResponse.redirect(url);
}

// runtime Node: il middleware legge data/admin-path.json.
// Le route che ricevono file grandi (immagini, template, backup, API articoli) NON passano dal middleware: Next ne copia il corpo in memoria e, a seconda dei tempi,
// lo tronca (il caricamento fallisce con «Failed to parse body as FormData», o un backup arriva incompleto). Ognuna controlla da sé sessione, origine
// e indirizzo ammesso (ADMIN_HOSTS); la Content-Security-Policy non serve a una risposta JSON.
export const config = { matcher: ['/((?!api/posts|admin/media/upload|admin/templates/upload|admin/backup/upload|install/template-upload|install/restore-upload).*)'], runtime: 'nodejs' };
