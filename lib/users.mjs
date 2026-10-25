// Gestione degli utenti del CMS: elenco, creazione, modifica, reimpostazione password, eliminazione, e i dati pubblici degli autori per il sito.
// Le regole di sicurezza stanno qui (non nelle pagine): l'ultimo amministratore non si elimina né si declassa, ognuno modifica il proprio
// profilo ma non il proprio ruolo, e un'email o una password non finiscono mai nel sito pubblico.
import { query, one, tx, parseJson, toJson } from './db.mjs';
import { hashPassword, passwordProblem, strongPassword } from './password.mjs';
import { normalizeEmail, destroyUserSessions } from './sessions.mjs';
import { audit } from './audit.mjs';
import { ROLES, isAdmin } from './permissions.mjs';
import { isSafeLogical } from '../render/images.mjs';

const USERNAME = /^[a-z0-9][a-z0-9._-]{2,39}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const HTTPS = /^https:\/\/[^\s"'<>]{4,290}$/;

const text = (v, max) => Array.from(String(v ?? '')).filter((c) => c.charCodeAt(0) > 31 || c === '\n').join('').trim().slice(0, max);

export const fullName = (first, last, fallback = '') => [first, last].map((x) => String(x ?? '').trim()).filter(Boolean).join(' ') || fallback;

// Dalla riga del database all'oggetto per l'interfaccia (mai l'hash della password).
export const toUser = (r) => r && ({
  id: r.id, username: r.username ?? '', email: r.email, role: r.role, active: !!r.active, name: r.name,
  firstName: r.first_name ?? '', lastName: r.last_name ?? '', description: r.description ?? '', avatar: r.avatar ?? '',
  linkedin: r.linkedin ?? '', socials: parseJson(r.socials) ?? [], seo: parseJson(r.seo) ?? {}, showPublic: !!r.show_public,
  lastLoginAt: r.last_login_at ? String(r.last_login_at) : null,
});

export async function listUsers() {
  return (await query('SELECT * FROM users ORDER BY FIELD(role, \'admin\', \'author\', \'normal\'), username')).map(toUser);
}
export async function getUser(id) { return toUser(await one('SELECT * FROM users WHERE id = ?', [id])); }
const adminCount = async (exceptId = null) => Number((await one("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1" + (exceptId ? ' AND id <> ?' : ''), exceptId ? [exceptId] : [])).n);

// Pulisce e controlla i dati di un profilo. Restituisce { value } oppure { errors: { campo: messaggio } }.
export function cleanProfile(input, { admin = false } = {}) {
  const errors = {};
  const v = {
    firstName: text(input.firstName, 80), lastName: text(input.lastName, 80), description: text(input.description, 2000),
    avatar: text(input.avatar, 255), linkedin: text(input.linkedin, 300), showPublic: input.showPublic !== false,
  };
  if (!v.firstName) errors.firstName = 'Scrivi il nome.';
  if (v.avatar && !isSafeLogical(v.avatar)) errors.avatar = 'Immagine non valida.';
  if (v.linkedin && !(HTTPS.test(v.linkedin) && /^https:\/\/([a-z0-9-]+\.)?linkedin\.com\//i.test(v.linkedin))) errors.linkedin = 'Scrivi l\'indirizzo completo del profilo LinkedIn (https://www.linkedin.com/in/…).';
  const socials = (Array.isArray(input.socials) ? input.socials : []).slice(0, 12).map((s) => ({ label: text(s?.label, 40), url: text(s?.url, 300) })).filter((s) => s.label || s.url);
  if (socials.some((s) => !s.label || !HTTPS.test(s.url))) errors.socials = 'Ogni social ha un nome e un indirizzo completo (https://…).';
  v.socials = socials;
  const s = input.seo ?? {};
  const know = (Array.isArray(s.knowsAbout) ? s.knowsAbout : String(s.knowsAbout ?? '').split(',')).map((x) => text(x, 60)).filter(Boolean).slice(0, 15);
  v.seo = {
    ...(text(s.title, 120) ? { title: text(s.title, 120) } : {}),
    ...(text(s.description, 300) ? { description: text(s.description, 300) } : {}),
    ...(text(s.jobTitle, 80) ? { jobTitle: text(s.jobTitle, 80) } : {}),
    ...(know.length ? { knowsAbout: know } : {}),
    ...(s.noindex ? { noindex: true } : {}),
  };
  if (admin) {
    v.username = text(input.username, 60).toLowerCase();
    v.email = normalizeEmail(input.email);
    v.role = input.role;
    if (!USERNAME.test(v.username)) errors.username = 'Il nome utente ha da 3 a 40 caratteri: lettere minuscole, numeri, punto, trattino e underscore.';
    if (!EMAIL.test(v.email) || v.email.length > 190) errors.email = 'Email non valida.';
    if (!ROLES.includes(v.role)) errors.role = 'Ruolo non valido.';
  }
  return Object.keys(errors).length ? { errors } : { value: v };
}

const dupError = (e) => (e?.code === 'ER_DUP_ENTRY' ? (/username/.test(e.message) ? { username: 'Questo nome utente è già in uso.' } : { email: 'Questa email è già in uso.' }) : null);

// Crea un utente (solo un admin). La password è obbligatoria e deve rispettare la politica.
export async function createUser(input, actor) {
  const c = cleanProfile(input, { admin: true });
  if (c.errors) return { ok: false, errors: c.errors };
  const pw = String(input.password ?? '');
  const problem = passwordProblem(pw, c.value);
  if (problem) return { ok: false, errors: { password: problem } };
  const v = c.value;
  try {
    const r = await query('INSERT INTO users (username, email, name, first_name, last_name, password_hash, role, description, avatar, linkedin, socials, seo, show_public) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [v.username, v.email, fullName(v.firstName, v.lastName, v.username), v.firstName, v.lastName || null, await hashPassword(pw), v.role, v.description || null, v.avatar || null, v.linkedin || null, toJson(v.socials), toJson(v.seo), v.showPublic ? 1 : 0]);
    await audit(actor?.id, 'user.create', `${v.username} (${v.role})`);
    return { ok: true, id: Number(r.insertId) };
  } catch (e) { const d = dupError(e); if (d) return { ok: false, errors: d }; throw e; }
}

// Modifica un utente. Un admin cambia tutto (anche ruolo e stato); chiunque cambia il proprio profilo (non ruolo, nome utente, email, stato).
export async function updateUser(id, input, actor) {
  const target = await one('SELECT * FROM users WHERE id = ?', [id]);
  if (!target) return { ok: false, error: 'L\'utente non esiste.' };
  const admin = isAdmin(actor);
  if (!admin && actor?.id !== id) return { ok: false, error: 'Non puoi modificare questo utente.' };
  const c = cleanProfile(admin ? input : { ...input, username: target.username, email: target.email, role: target.role }, { admin: true });
  if (c.errors) return { ok: false, errors: c.errors };
  const v = c.value;
  const active = admin && typeof input.active === 'boolean' ? input.active : !!target.active;
  if (admin && actor.id === id && (v.role !== 'admin' || !active)) return { ok: false, error: 'Non puoi togliere a te stesso il ruolo di amministratore né disattivarti: chiedilo a un altro amministratore.' };
  if (target.role === 'admin' && (v.role !== 'admin' || !active) && (await adminCount(id)) === 0) return { ok: false, error: 'Deve restare almeno un amministratore attivo.' };
  try {
    await query('UPDATE users SET username = ?, email = ?, name = ?, first_name = ?, last_name = ?, role = ?, active = ?, description = ?, avatar = ?, linkedin = ?, socials = ?, seo = ?, show_public = ? WHERE id = ?',
      [v.username, v.email, fullName(v.firstName, v.lastName, v.username), v.firstName, v.lastName || null, v.role, active ? 1 : 0, v.description || null, v.avatar || null, v.linkedin || null, toJson(v.socials), toJson(v.seo), v.showPublic ? 1 : 0, id]);
  } catch (e) { const d = dupError(e); if (d) return { ok: false, errors: d }; throw e; }
  if (!active || v.role !== target.role) await destroyUserSessions(id);   // disattivato o con un ruolo diverso: deve riaccedere
  await audit(actor?.id, 'user.update', `${v.username}${v.role !== target.role ? ` (ruolo ${target.role} → ${v.role})` : ''}`);
  return { ok: true };
}

// Reimposta la password (solo un admin): quella scelta, oppure una generata. Chiude le sessioni dell'utente. La password generata si mostra una sola volta.
export async function resetPassword(id, actor, chosen = null) {
  const target = await one('SELECT id, username, email FROM users WHERE id = ?', [id]);
  if (!target) return { ok: false, error: 'L\'utente non esiste.' };
  const pw = chosen ? String(chosen) : strongPassword(target);
  const problem = passwordProblem(pw, target);
  if (problem) return { ok: false, error: problem };
  await query('UPDATE users SET password_hash = ? WHERE id = ?', [await hashPassword(pw), id]);
  await destroyUserSessions(id);
  await audit(actor?.id, 'user.reset-password', target.username);
  return { ok: true, password: chosen ? null : pw };
}

// Elimina un utente (solo un admin). I suoi contenuti restano (senza proprietario); le immagini caricate restano nella libreria.
export async function deleteUser(id, actor) {
  const target = await one('SELECT id, username, role, active FROM users WHERE id = ?', [id]);
  if (!target) return { ok: false, error: 'L\'utente non esiste.' };
  if (actor?.id === id) return { ok: false, error: 'Non puoi eliminare il tuo stesso account.' };
  if (target.role === 'admin' && (await adminCount(id)) === 0) return { ok: false, error: 'Deve restare almeno un amministratore attivo.' };
  await tx(async (t) => { await t.query('DELETE FROM users WHERE id = ?', [id]); });
  await audit(actor?.id, 'user.delete', target.username);
  return { ok: true };
}

// Autori per il sito pubblico: solo chi ha un ruolo che scrive, è attivo e ha scelto di comparire. Mai email, password o altri dati interni.
export async function publicAuthors() {
  const rows = await query("SELECT * FROM users WHERE role IN ('admin', 'author') AND active = 1 AND show_public = 1 ORDER BY username");
  return rows.map((r) => { const u = toUser(r); return { username: u.username, name: u.name, firstName: u.firstName, lastName: u.lastName, description: u.description, avatar: u.avatar, linkedin: u.linkedin, socials: u.socials, seo: u.seo }; });
}

// Azioni su più utenti (solo un admin): cambiare ruolo, spegnere o riaccendere il profilo pubblico, eliminare.
// Si procede un utente alla volta e le regole di sicurezza valgono per ognuno: non si agisce su se stessi (ruolo, eliminazione) e
// l'ultimo amministratore attivo resta. Restituisce { ok, done, skipped: ['nome: motivo'] }.
export async function bulkUsers(ids, action, { role } = {}, actor) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 200 || !ids.every((i) => Number.isInteger(i) && i > 0)) return { ok: false, error: 'Nessun utente selezionato.' };
  if (!['role', 'delete', 'hide', 'show'].includes(action)) return { ok: false, error: 'Azione non valida.' };
  if (action === 'role' && !ROLES.includes(role)) return { ok: false, error: 'Scegli il nuovo ruolo.' };
  let done = 0; const skipped = [];
  for (const id of ids) {
    const u = await one('SELECT id, username, role, active FROM users WHERE id = ?', [id]);
    if (!u) continue;
    const who = u.username ?? `#${id}`;
    if (action === 'hide' || action === 'show') {
      await query('UPDATE users SET show_public = ? WHERE id = ?', [action === 'show' ? 1 : 0, id]);
      await audit(actor?.id, 'user.bulk', `${who}: profilo ${action === 'show' ? 'visibile' : 'nascosto'}`);
      done++; continue;
    }
    if (id === actor?.id) { skipped.push(`${who}: non puoi farlo su te stesso`); continue; }
    if (u.role === 'admin' && u.active && (action === 'delete' || role !== 'admin') && (await adminCount(id)) === 0) { skipped.push(`${who}: deve restare almeno un amministratore`); continue; }
    if (action === 'delete') { await tx(async (t) => { await t.query('DELETE FROM users WHERE id = ?', [id]); }); await audit(actor?.id, 'user.delete', who); done++; continue; }
    if (u.role === role) { done++; continue; }
    await query('UPDATE users SET role = ? WHERE id = ?', [role, id]);
    await destroyUserSessions(id);   // con un ruolo diverso deve riaccedere
    await audit(actor?.id, 'user.bulk', `${who}: ruolo ${u.role} → ${role}`);
    done++;
  }
  return { ok: true, done, skipped };
}
