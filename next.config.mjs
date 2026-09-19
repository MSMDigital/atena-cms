// L'admin è l'unica parte servita da Next.js. Il sito pubblico è HTML statico generato in dist/ (vedi render/).
// La Content-Security-Policy dell'admin (con nonce per richiesta) è nel middleware.
const https = (process.env.APP_ORIGIN ?? '').startsWith('https://');
const base = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  ...(https ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }] : []),   // solo se l'app è davvero servita in https
];

export default {
  poweredByHeader: false,
  serverExternalPackages: ['mysql2', 'nodemailer'],
  async headers() {
    return [
      {
        source: '/admin/:path*',
        headers: [
          ...base,
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },          // l'anteprima è un iframe della stessa origine
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
      { source: '/install/:path*', headers: [...base, { key: 'X-Frame-Options', value: 'DENY' }, { key: 'Referrer-Policy', value: 'no-referrer' }, { key: 'Cache-Control', value: 'no-store' }] },
      { source: '/api/:path*', headers: [...base, { key: 'Referrer-Policy', value: 'no-referrer' }, { key: 'Cache-Control', value: 'no-store' }] },
    ];
  },
};
