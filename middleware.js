// Prima barriera: senza cookie di sessione si va al login. La verifica vera (sessione valida nel database, ruolo) è nel server, pagina per pagina.
// In più, ogni pagina dell'admin riceve una Content-Security-Policy con un valore casuale (nonce) per richiesta: solo gli script di Next e i file
// dello stesso sito girano, quindi un <script> o un onerror="..." finito per errore in un contenuto (anche nell'anteprima, che eredita la politica)
// non viene eseguito. Gli stili "inline" restano ammessi (l'anteprima li usa per i colori dal vivo e l'editor per il punto focale).
import { NextResponse } from 'next/server';

// Solo con `next dev`: il refresh automatico di React usa eval e un WebSocket. In produzione (next start) la politica resta stretta.
const DEV = process.env.NODE_ENV === 'development';

const policy = (nonce, sandbox = false) => [
  "default-src 'self'",
  `script-src 'self' 'nonce-${nonce}'${DEV ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "frame-src 'self' https://www.google.com",       // la mappa, dopo il clic sul consenso, anche nell'anteprima
  DEV ? "connect-src 'self' ws: wss:" : "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  ...(sandbox ? ['sandbox allow-scripts'] : []),      // il documento dell'anteprima non ha l'origine dell'admin nemmeno se aperto da solo
].join('; ');

function withPolicy(req, sandbox = false) {
  const nonce = btoa(crypto.randomUUID());
  const csp = policy(nonce, sandbox);
  const headers = new Headers(req.headers);
  headers.set('Content-Security-Policy', csp);      // Next legge il nonce da qui e lo mette sui propri script
  headers.set('x-nonce', nonce);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set('Content-Security-Policy', csp);
  return res;
}

export function middleware(req) {
  const { pathname, search } = req.nextUrl;
  // Admin e installazione solo dagli indirizzi indicati (ADMIN_HOSTS, separati da virgola): sul dominio del sito pubblico non devono esistere.
  // Così il JavaScript di un template servito dal sito non condivide l'origine dell'admin.
  const hosts = (process.env.ADMIN_HOSTS ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
  if (hosts.length && !hosts.includes((req.headers.get('host') ?? '').toLowerCase())) return new NextResponse('Non trovato', { status: 404 });
  if (pathname.startsWith('/install')) return withPolicy(req);   // l'installazione ha la sua protezione (chiave di installazione) e la stessa politica di sicurezza
  // I file dell'anteprima li carica un documento con origine opaca (senza cookie): la route decide da sé cosa è pubblico e cosa no.
  if (pathname.startsWith('/admin/preview-assets/')) return withPolicy(req);
  if ((pathname === '/admin/preview' || pathname.startsWith('/admin/preview/')) && req.cookies.get('cms_session')) return withPolicy(req, true);   // documento dell'anteprima: sandbox
  // Senza sessione il documento dell'anteprima non si reindirizza al login: finirebbe una pagina dell'admin dentro un iframe sandboxed.
  if (pathname === '/admin/preview' || pathname.startsWith('/admin/preview/')) return new NextResponse('Non autorizzato', { status: 401 });
  if (pathname === '/admin/login' || req.cookies.get('cms_session')) return withPolicy(req);
  const url = req.nextUrl.clone();
  url.pathname = '/admin/login';
  url.search = '';
  if (pathname !== '/admin') url.searchParams.set('next', pathname + search);
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/admin/:path*', '/install/:path*', '/install'] };
