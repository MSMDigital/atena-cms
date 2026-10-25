// Impostazioni generali del sito (Impostazioni → Generale), nella tabella settings (nome 'general'): email dell'amministrazione, fuso orario,
// formati di data e ora, primo giorno della settimana, lingua dell'admin. La parte «pubblica» (fuso, formati, settimana) arriva anche ai template.
import { query, one } from './db.mjs';
import { DATE_FORMATS, TIME_FORMATS, DEFAULT_TZ } from '../render/format.mjs';

export const CMS_LANGUAGES = ['it', 'en'];
export const WEEK_DAYS = [1, 6, 0];   // lunedì, sabato, domenica (0 = domenica, come getDay)
const EMAIL = /^[^\s@<>"',;:\\]+@[^\s@<>"',;:\\]+\.[^\s@<>"',;:\\]{2,}$/;

export const DEFAULTS = { adminEmail: '', timezone: DEFAULT_TZ, dateFormat: null, timeFormat: '24h', weekStart: 1, cmsLanguage: 'it' };

export const timezones = () => { try { return ['UTC', ...Intl.supportedValuesOf('timeZone').filter((z) => z !== 'UTC')]; } catch { return ['UTC', DEFAULT_TZ, 'Europe/Rome']; } };
// Un nome valido per il motore (anche UTC e gli alias), senza dipendere dall'elenco mostrato nel menu.
const validZone = (tz) => /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+){0,2}$/.test(tz) && (() => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; } })();

export async function getGeneral() {
  const row = await one("SELECT value FROM settings WHERE name = 'general'");
  let v = {}; try { v = row ? JSON.parse(row.value) : {}; } catch { /* illeggibile: valori predefiniti */ }
  return { ...DEFAULTS, ...v };
}

// Quanto serve ai template e al build: niente indirizzi email.
export const publicGeneral = (g) => ({ timezone: g.timezone, dateFormat: g.dateFormat, timeFormat: g.timeFormat, weekStart: g.weekStart, cmsLanguage: g.cmsLanguage });   // cmsLanguage: i componenti client formattano le date nella lingua dell'admin

// Controlla e salva. Restituisce { ok: true, value } oppure { ok: false, errors: { campo: messaggio } }.
export function cleanGeneral(input) {
  const errors = {};
  const adminEmail = String(input?.adminEmail ?? '').trim();
  if (adminEmail && (!EMAIL.test(adminEmail) || adminEmail.length > 254)) errors.adminEmail = 'Indirizzo email non valido.';
  const timezone = String(input?.timezone ?? DEFAULTS.timezone);
  if (!validZone(timezone)) errors.timezone = 'Fuso orario non valido.';
  const dateFormat = input?.dateFormat === '' || input?.dateFormat == null ? null : String(input.dateFormat);
  if (dateFormat && !DATE_FORMATS.includes(dateFormat)) errors.dateFormat = 'Formato della data non valido.';
  const timeFormat = String(input?.timeFormat ?? '24h');
  if (!TIME_FORMATS.includes(timeFormat)) errors.timeFormat = 'Formato dell\'ora non valido.';
  const weekStart = Number(input?.weekStart ?? DEFAULTS.weekStart);
  if (!WEEK_DAYS.includes(weekStart)) errors.weekStart = 'Giorno non valido.';
  const cmsLanguage = String(input?.cmsLanguage ?? 'it');
  if (!CMS_LANGUAGES.includes(cmsLanguage)) errors.cmsLanguage = 'Lingua non disponibile.';
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: { adminEmail, timezone, dateFormat, timeFormat, weekStart, cmsLanguage } };
}

export async function saveGeneral(input, userId) {
  const c = cleanGeneral(input);
  if (!c.ok) return c;
  await query("INSERT INTO settings (name, value, updated_by) VALUES ('general', ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value), updated_by = VALUES(updated_by)", [JSON.stringify(c.value), userId ?? null]);
  return c;
}
