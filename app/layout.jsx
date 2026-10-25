import './admin.css';
import { getLang } from '@/lib/i18n-server.mjs';

export const metadata = { title: 'Atena CMS', robots: { index: false, follow: false } };

export default async function RootLayout({ children }) {
  const lang = await getLang().catch(() => 'it');   // senza database (installazione) resta l'italiano
  return (
    <html lang={lang}>
      <body>{children}</body>
    </html>
  );
}
