import { requireUser } from '@/lib/auth.mjs';
import { query } from '@/lib/db.mjs';
import { listApiTokens } from '@/lib/api-tokens.mjs';
import { getGeneral } from '@/lib/general.mjs';
import { getT } from '@/lib/i18n-server.mjs';
import { formatStamp } from '@/render/format.mjs';
import ApiTokens from './ApiTokens';

export const dynamic = 'force-dynamic';
export async function generateMetadata() { const t = await getT(); return { title: `${t('API')} | Atena CMS` }; }

export default async function ApiPage() {
  await requireUser('admin');
  const t = await getT();
  const g = await getGeneral();
  const users = await query("SELECT id, name FROM users WHERE active = 1 AND role IN ('admin', 'author') ORDER BY name");
  const stamp = (d) => (d ? formatStamp(d, g) : null);
  const tokens = (await listApiTokens()).map((x) => ({
    id: x.id, name: x.name, prefix: x.prefix, user: x.user_name, userActive: !!x.user_active, revoked: !!x.revoked_at,
    expired: !!x.expires_at && new Date(x.expires_at) < new Date(), created: stamp(x.created_at), expires: stamp(x.expires_at), lastUsed: stamp(x.last_used_at), lastIp: x.last_ip,
  }));
  const origin = (process.env.APP_ORIGIN || '').replace(/\/$/, '');
  return (
    <main className="page page--settings">
      <div className="page__head"><h1>{t('API')}</h1></div>
      <p className="hint">{t('Per inviare articoli da un programma esterno (per esempio Claude). Ogni articolo arriva sempre come bozza: un amministratore lo controlla e lo pubblica da Articoli. Ogni token appartiene a un utente (sarà l\'autore degli articoli) e si può revocare in qualsiasi momento.')}</p>
      <ApiTokens tokens={tokens} users={users} endpoint={`${origin}/api/posts`} />
    </main>
  );
}
