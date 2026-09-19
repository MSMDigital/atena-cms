// Processo isolato in cui gira l'HTML dei template. Lo avvia render/host.mjs con il modello di permessi di Node: nessuna scrittura su file,
// nessuna lettura fuori da questa cartella e dalla cartella del template, nessun processo figlio, nessun worker, nessun addon nativo;
// e senza variabili d'ambiente (niente password del database né chiavi). Riceve i dati del sito via messaggi e restituisce HTML.
import { pathToFileURL } from 'node:url';
import { createContext } from './context.mjs';

let renderer = null;
const reply = (msg) => process.send(msg);

process.on('message', async (msg) => {
  const { id, op } = msg ?? {};
  try {
    if (op === 'init') {
      const mod = await import(pathToFileURL(msg.entry).href);
      renderer = mod.default;
      if (typeof renderer?.renderPage !== 'function') throw new Error('render/index.mjs deve esportare di default { renderPage(ctx, page) }');
      return reply({ id, ok: true });
    }
    if (op === 'render') {
      const out = []; let total = 0;
      for (const job of msg.jobs) {
        const ctx = createContext(msg.data, job.locale, { images: msg.images ?? {} });
        for (const key of job.keys) {
          const page = msg.data.pages.find((p) => p.key === key);
          const html = renderer.renderPage(ctx, page);
          if (typeof html !== 'string') throw new Error(`renderPage non ha restituito una stringa per "${key}"`);
          total += html.length;
          if (html.length > 8_000_000 || total > 40_000_000) throw new Error('L\'HTML prodotto è troppo grande.');
          out.push({ locale: job.locale, key, html });
        }
      }
      return reply({ id, ok: true, out });
    }
    throw new Error(`operazione sconosciuta: ${op}`);
  } catch (e) {
    reply({ id, ok: false, error: { message: String(e?.message ?? e).slice(0, 2000) } });
  }
});
reply({ ready: true });
