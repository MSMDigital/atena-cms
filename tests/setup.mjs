// Le prove usano il template starter come "contenuto di prova" del motore: si attiva prima di ogni file di test.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.CMS_TEMPLATE_DIR = path.resolve(fileURLToPath(new URL('../templates/starter', import.meta.url)));
