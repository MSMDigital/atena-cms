// Controlli sul contenuto che arriva dall'editor, fatti dal SERVER (il browser si può aggirare chiamando l'azione direttamente).
//  - unsafeText: testo con "<" che non rispetta i tag ammessi dei testi ricchi (niente <script>, <img onerror>, link javascript:...);
//  - deliveryProblem: destinatari e oggetto delle email dei moduli li cambia solo un admin (chi li cambia riceve i dati personali).
// Ogni uscita sanifica comunque (render/sanitize.mjs): questi controlli danno un errore chiaro a chi scrive e chiudono la porta a monte.
import { BLOCK } from '../schema/common.mjs';

const RICH = new RegExp(BLOCK, 'u');
const MAX_DEPTH = 40;

// Primo percorso (JSON pointer) con testo non ammesso, oppure null.
export function unsafeText(data) {
  const walk = (node, path, depth) => {
    if (depth > MAX_DEPTH) return path;                                 // annidamento assurdo: non è un documento nostro
    if (typeof node === 'string') return node.includes('<') && !RICH.test(node) ? path : null;
    if (Array.isArray(node)) { for (let i = 0; i < node.length; i++) { const r = walk(node[i], `${path}/${i}`, depth + 1); if (r) return r; } return null; }
    if (node && typeof node === 'object') { for (const [k, v] of Object.entries(node)) { const r = walk(v, `${path}/${k}`, depth + 1); if (r) return r; } }
    return null;
  };
  return walk(data, '', 0);
}

const formsOf = (kind, data) => {
  const out = new Map();
  const blocks = kind === 'page' ? (Array.isArray(data?.blocks) ? data.blocks : []) : kind === 'shared' ? Object.values(data ?? {}) : [];
  for (const b of blocks) if (b && typeof b === 'object' && b.type === 'form' && typeof b.id === 'string') out.set(b.id, JSON.stringify(b.delivery ?? null));
  return out;
};

// Per chi non è admin: nessun modulo nuovo e nessuna modifica ai destinatari o all'oggetto. Restituisce un messaggio o null.
export function deliveryProblem(kind, newData, oldData) {
  const before = formsOf(kind, oldData); const after = formsOf(kind, newData);
  for (const [id, delivery] of after) {
    if (!before.has(id)) return 'Solo un admin può aggiungere un modulo (i destinatari delle richieste li decide lui).';
    if (before.get(id) !== delivery) return 'Solo un admin può cambiare i destinatari e l\'oggetto dell\'email di un modulo.';
  }
  return null;
}
