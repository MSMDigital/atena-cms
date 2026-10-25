// Politica delle password: pura (nessuna dipendenza da Node), così la usano sia il server sia i moduli dell'interfaccia.
export const MIN_PASSWORD = 12;

// Politica per le password scelte da un amministratore (nuovo utente, reimpostazione): lunghezza, varietà di caratteri, niente nome utente o email.
// Restituisce un messaggio di errore oppure null. `who`: { username, email } per evitare password costruite sui propri dati.
export function passwordProblem(pw, who = {}) {
  const p = String(pw ?? '');
  if (p.length < MIN_PASSWORD) return `La password deve avere almeno ${MIN_PASSWORD} caratteri.`;
  if (p.length > 200) return 'La password è troppo lunga (massimo 200 caratteri).';
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((r) => r.test(p)).length;
  if (classes < 3) return 'Usa almeno tre tipi di caratteri tra minuscole, maiuscole, numeri e simboli.';
  const low = p.toLowerCase();
  const bits = [who.username, String(who.email ?? '').split('@')[0]].map((x) => String(x ?? '').toLowerCase()).filter((x) => x.length >= 4);
  if (bits.some((b) => low.includes(b))) return 'La password non deve contenere il nome utente o l\'email.';
  if (/^(.)\1+$/.test(p) || /(0123|1234|2345|3456|4567|5678|6789|abcd|qwer|password)/i.test(p)) return 'La password è troppo prevedibile.';
  return null;
}

