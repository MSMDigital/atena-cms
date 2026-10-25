import { requireUser } from '@/lib/auth.mjs';
import { getT } from '@/lib/i18n-server.mjs';
import { viewState } from './view-state';
import AdminPathSettings from './AdminPathSettings';

export const dynamic = 'force-dynamic';
export async function generateMetadata() { const t = await getT(); return { title: `${t('Login sicuro')} | Atena CMS` }; }

// Le parti tra \u0001 … \u0001 vanno in <code>.
const code = (text) => text.split('\u0001').map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part));

export default async function SecurityPage() {
  await requireUser('admin');
  const t = await getT();
  return (
    <main className="page page--settings">
      <div className="page__head"><h1>{t('Login sicuro')}</h1></div>
      <p className="hint">{code(t("L'indirizzo della pagina di accesso. Di serie è {a}, il primo che qualsiasi bot prova. Con un indirizzo tuo la pagina di accesso e l'admin si aprono solo da lì e {a} risponde «non trovato» a chi non è già dentro.", { a: '\u0001/admin/login\u0001' }))}</p>
      <AdminPathSettings initial={await viewState()} />
    </main>
  );
}
