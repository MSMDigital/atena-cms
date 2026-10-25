// Controlli sul contenuto che arriva dall'editor, fatti dal SERVER (il browser si può aggirare chiamando l'azione direttamente).
//  - unsafeText: testo con "<" che non rispetta i tag ammessi dei testi ricchi (niente <script>, <img onerror>, link javascript:...);
//    fa eccezione per i campi di CODICE del motore (tracciamento, blocco "Codice HTML"): sono sempre riservati a un admin (vedi sotto);
//  - deliveryProblem: destinatari e oggetto delle email dei moduli li cambia solo un admin (chi li cambia riceve i dati personali);
//  - htmlBlockProblem: il codice di un blocco "Codice HTML" (diretto o condiviso) lo scrive o lo cambia solo un admin.
// Ogni uscita sanifica comunque (render/sanitize.mjs): questi controlli danno un errore chiaro a chi scrive e chiudono la porta a monte.
import { FULL } from '../schema/common.mjs';

const RICH = new RegExp(FULL, 'u');   // il guard è generico (non sa di che campo si tratta): vale il limite più ampio; lo schema applica poi quello di ogni campo
const MAX_DEPTH = 40;

// Percorsi (JSON pointer) di "dati del sito" il cui testo è codice ammesso apposta: tracciamento e llms.txt. Fissi (il motore li definisce,
// un template non li può ridefinire: lib/template-install.mjs), quindi qui un semplice elenco è sicuro quanto leggere lo schema.
const CODE_SITE_PATHS = new Set(['/geo/llmsText', '/tracking/css', '/tracking/headCode', '/tracking/bodyStartCode', '/tracking/bodyEndCode']);

// Primo percorso (JSON pointer) con testo non ammesso, oppure null. `skip(path, parent, key)`: torna true per un campo di codice ammesso.
export function unsafeText(data, skip) {
  const walk = (node, path, depth, parent, key) => {
    if (depth > MAX_DEPTH) return path;                                 // annidamento assurdo: non è un documento nostro
    if (typeof node === 'string') return node.includes('<') && !RICH.test(node) && !(skip && skip(path, parent, key)) ? path : null;
    if (Array.isArray(node)) { for (let i = 0; i < node.length; i++) { const r = walk(node[i], `${path}/${i}`, depth + 1, node, i); if (r) return r; } return null; }
    if (node && typeof node === 'object') { for (const [k, v] of Object.entries(node)) { const r = walk(v, `${path}/${k}`, depth + 1, node, k); if (r) return r; } }
    return null;
  };
  return walk(data, '', 0, null, null);
}

// Predicato per unsafeText: quali campi di QUESTO tipo di documento sono codice ammesso. Sempre in documenti già riservati a un admin
// (kind 'site') o su un campo specifico di un blocco riservato a un admin dalla stessa regola di htmlBlockProblem (tipo "html").
export const allowedCode = (kind) => (path, parent, key) => (kind === 'site' && CODE_SITE_PATHS.has(path)) || (key === 'html' && parent?.type === 'html');

// Blocchi di un certo tipo in un documento pagina o blocchi condivisi: id -> blocco.
const blocksOfType = (kind, data, type) => {
  const out = new Map();
  const blocks = kind === 'page' || kind === 'post' ? (Array.isArray(data?.blocks) ? data.blocks : []) : kind === 'shared' ? Object.values(data ?? {}) : [];
  for (const b of blocks) if (b && typeof b === 'object' && b.type === type && typeof b.id === 'string') out.set(b.id, b);
  return out;
};

// Per chi non è admin: nessun modulo nuovo e nessuna modifica ai destinatari o all'oggetto. Restituisce un messaggio o null.
export function deliveryProblem(kind, newData, oldData) {
  const before = blocksOfType(kind, oldData, 'form'); const after = blocksOfType(kind, newData, 'form');
  for (const [id, b] of after) {
    const prev = before.get(id);
    if (!prev) return 'Solo un admin può aggiungere un modulo (i destinatari delle richieste li decide lui).';
    if (JSON.stringify(prev.delivery ?? null) !== JSON.stringify(b.delivery ?? null)) return 'Solo un admin può cambiare i destinatari e l\'oggetto dell\'email di un modulo.';
  }
  return null;
}

// Per chi non è admin: nessun blocco "Codice HTML" nuovo e nessuna modifica al suo codice (visibilità e altri campi restano liberi).
export function htmlBlockProblem(kind, newData, oldData) {
  const before = blocksOfType(kind, oldData, 'html'); const after = blocksOfType(kind, newData, 'html');
  for (const [id, b] of after) {
    const prev = before.get(id);
    if (!prev) return 'Solo un admin può aggiungere un blocco di codice HTML.';
    if ((prev.html ?? '') !== (b.html ?? '')) return 'Solo un admin può cambiare il codice di un blocco HTML.';
  }
  return null;
}
