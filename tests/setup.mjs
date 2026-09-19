// Le prove usano il template di Mammano come "contenuto di prova" del motore: si attiva prima di ogni file di test.
import path from 'node:path';
process.env.CMS_TEMPLATE_DIR = path.resolve(new URL('../templates/mammano', import.meta.url).pathname);
