// Ruoli e permessi. Funzioni pure (niente database): le usano le pagine, le azioni del server e i test.
//   admin  (Amministratore): tutto.
//   author (Autore): crea e modifica i PROPRI contenuti (articoli, pagine, immagini) e li salva come bozze; non pubblica, non tocca impostazioni, utenti, stile.
//   normal (Normale): per ora nessun privilegio.
// Un contenuto è «proprio» se l'ha creato l'utente (docs.created_by) o se l'admin l'ha assegnato come autore (campo «author»).
export const ROLES = ['admin', 'author', 'normal'];
export const ROLE_LABEL = { admin: 'Amministratore', author: 'Autore', normal: 'Normale' };
export const RANK = { normal: 1, author: 2, admin: 3 };

export const isAdmin = (u) => u?.role === 'admin';
export const canWrite = (u) => RANK[u?.role] >= RANK.author;   // crea e modifica contenuti propri
export const atLeast = (u, role) => (RANK[u?.role] ?? 0) >= RANK[role];

// L'autore di un contenuto (nome o nome utente) è questo utente?
export const authorIs = (value, user) => {
  const v = String(value ?? '').trim().toLowerCase();
  return !!v && !!user && (v === String(user.username ?? '').toLowerCase() || v === String(user.name ?? '').trim().toLowerCase());
};

// `doc`: { created_by, draft } come nella tabella docs.
export const ownsDoc = (user, doc) => !!user && !!doc && (isAdmin(user) || (canWrite(user) && ((doc.created_by != null && doc.created_by === user.id) || authorIs(doc.draft?.author, user))));

// Un caricamento di immagine è proprio se l'ha caricato l'utente. Le immagini del progetto sono dell'admin.
export const ownsMedia = (user, row) => !!user && !!row && (isAdmin(user) || (canWrite(user) && row.source === 'upload' && row.uploaded_by != null && row.uploaded_by === user.id));

// Tipi di documento che un autore può modificare (solo se suoi).
export const AUTHOR_KINDS = new Set(['page', 'post']);
