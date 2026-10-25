import { requireUser } from '@/lib/auth.mjs';
import { MIN_PASSWORD } from '@/lib/password.mjs';
import { getUser } from '@/lib/users.mjs';
import { listMedia, maxUploadBytes } from '@/lib/media.mjs';
import { canWrite, ROLE_LABEL } from '@/lib/permissions.mjs';
import UserForm from '../users/UserForm';
import AccountForm from './AccountForm';
import { saveProfileAction } from './actions';
import { getT } from '@/lib/i18n-server.mjs';

export const dynamic = 'force-dynamic';
export async function generateMetadata() { const t = await getT(); return { title: `${t('Il mio profilo')} | Atena CMS` }; }

export default async function AccountPage() {
  const me = await requireUser();
  const t = await getT();
  const user = await getUser(me.id);
  return (
    <main className="page">
      <div className="page__head"><h1>{t('Il mio profilo')}</h1></div>
      <p className="hint">{user.username} · {user.email} · {t(ROLE_LABEL[user.role] ?? user.role)}</p>
      <UserForm mode="profile" initial={user} isSelf save={saveProfileAction} media={canWrite(me) ? await listMedia() : null} maxMb={Math.round(maxUploadBytes() / 1048576)} />
      <section className="card account">
        <h2>{t('Cambia password')}</h2>
        <AccountForm min={MIN_PASSWORD} />
      </section>
    </main>
  );
}
