// Carica .env (senza sovrascrivere le variabili già presenti). Per gli script da riga di comando: Next legge .env da solo.
import fs from 'node:fs';
import path from 'node:path';

// process.cwd(), non un percorso derivato da import.meta.url: nella build di Next.js (webpack) quel percorso viene
// risolto in modo statico, con la cartella della MACCHINA DI BUILD incorporata nel bundle — se poi .next viene
// pubblicato su un server con un percorso diverso da quello dove si è buildato (deploy comuni su hosting condiviso,
// dove si builda in locale e si pubblica solo il risultato), ROOT punterebbe ancora alla cartella del computer di
// sviluppo (visto sul campo: errori ENOENT su percorsi del computer di build, mai esistiti sul server). process.cwd()
// si risolve invece a runtime, dov'è avviato il processo. Gli script da riga di comando (scripts/*.mjs) vanno sempre
// lanciati dalla cartella del progetto.
export const ROOT = process.cwd();

// Il file di configurazione (ENV_FILE per le prove e per chi lo tiene altrove; di norma .env nella cartella del progetto).
export const envFile = () => path.resolve(process.env.ENV_FILE ?? path.join(ROOT, '.env'));

let loaded = false;
export function loadEnv() {
  if (loaded) return;
  loaded = true;
  const file = envFile();
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !m[1].startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

// Gli script di prova e il reseed forzato CANCELLANO dati (richieste, impostazioni, contenuti): partono solo su un database locale.
export function assertLocalDatabase(what = 'Questo script') {
  loadEnv();
  const host = (process.env.DB_HOST ?? '127.0.0.1').toLowerCase();
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
    console.error(`${what} cancella dati e parte solo su un database locale (DB_HOST=${host}). Rifiuto di continuare.`);
    process.exit(1);
  }
}
