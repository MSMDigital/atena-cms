import fs from 'node:fs';
import { Readable } from 'node:stream';
import { currentUser } from '@/lib/auth.mjs';
import { getT } from '@/lib/i18n-server.mjs';
import { backupPath } from '@/lib/backup.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Scarica un pacchetto di backup (solo admin). Il nome si controlla con una regola rigida: niente percorsi.
export async function GET(_req, { params }) {
  const user = await currentUser();
  if (!user || user.role !== 'admin') return new Response((await getT())('Non autorizzato'), { status: 401 });
  const { name } = await params;
  const file = backupPath(name);
  if (!file || !fs.existsSync(file)) return new Response((await getT())('Non trovato'), { status: 404 });
  return new Response(Readable.toWeb(fs.createReadStream(file)), {
    headers: { 'Content-Type': 'application/zip', 'Content-Length': String(fs.statSync(file).size), 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}
