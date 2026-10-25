import { requireUser } from '@/lib/auth.mjs';
import { listBackups, listRestoreFiles } from '@/lib/backup.mjs';
import { getGeneral, publicGeneral } from '@/lib/general.mjs';
import { getT } from '@/lib/i18n-server.mjs';
import BackupPanel from './BackupPanel';

export const dynamic = 'force-dynamic';
export async function generateMetadata() { const t = await getT(); return { title: `${t('Backup')} | Atena CMS` }; }

export default async function BackupPage() {
  await requireUser('admin');
  const t = await getT();
  const g = publicGeneral(await getGeneral());
  const maxMb = Math.round((+process.env.BACKUP_MAX_MB || 4096));
  return (
    <main className="page page--settings">
      <div className="page__head"><h1>{t('Backup')}</h1></div>
      <p className="hint">{t('Un solo pacchetto con tutto il sito: database, immagini, template e (a scelta) il sito pubblicato. Per spostare il sito su un altro server: scarica il pacchetto, installa il CMS sul nuovo server, apri la pagina di installazione e scegli «Ripristina da un backup».')}</p>
      <BackupPanel backups={listBackups()} uploads={await listRestoreFiles()} general={g} maxMb={maxMb} />
    </main>
  );
}
