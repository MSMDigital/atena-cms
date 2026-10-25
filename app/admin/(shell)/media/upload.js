// Caricamento dal browser: un file per richiesta, con errore leggibile.
export async function uploadFile(file, { replace, t = (s) => s } = {}) {
  const body = new FormData();
  body.append('file', file);
  if (replace) body.append('replace', replace);   // sostituisce l'immagine con quel percorso, tenendolo
  let res;
  try { res = await fetch('/admin/media/upload', { method: 'POST', body }); } catch { return { ok: false, error: t('Connessione non riuscita.') }; }
  let json = null;
  try { json = await res.json(); } catch { /* risposta non JSON */ }
  if (json?.ok) return { ok: true, item: json.item };
  if (res.status === 401) return { ok: false, error: t('Sessione scaduta: accedi di nuovo.') };
  return { ok: false, error: json?.error ?? (res.status === 413 ? t('Il file è troppo grande.') : t('Caricamento non riuscito.')) };
}

export const ACCEPT = 'image/jpeg,image/png,image/webp,image/svg+xml';

// Carica più file in sequenza. onItem(item) a ogni file riuscito; restituisce gli errori "nome: messaggio".
export async function uploadMany(files, onItem, t = (s) => s) {
  const errors = [];
  for (const f of files) {
    const r = await uploadFile(f, { t });
    if (r.ok) onItem(r.item); else errors.push(`${f.name}: ${r.error}`);
  }
  return errors;
}
