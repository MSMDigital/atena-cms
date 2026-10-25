// Formati di data e ora del sito (Impostazioni → Generale). Funzioni pure: le usano l'admin, il build e i template (sta in render/ perché il processo
// isolato dei template legge solo questa cartella).
//   dateFormat: 'DD.MM.YYYY' | 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD' | 'D MMMM YYYY' (token: DD D MM M YYYY MMMM); assente = predefinito
//   timeFormat: '24h' (14:30) | '12h' (2:30 PM)
//   timezone:   nome IANA (Europe/Zurich)
export const DATE_FORMATS = ['DD.MM.YYYY', 'DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'D MMMM YYYY', 'D MMM YYYY', 'MMMM D, YYYY', 'MMM D, YYYY'];
// Formati regionali pronti (Impostazioni → Generale): data, ora, primo giorno della settimana (0 = domenica, 1 = lunedì).
export const REGION_PRESETS = {
  it: { dateFormat: 'DD.MM.YYYY', timeFormat: '24h', weekStart: 1 },
  gb: { dateFormat: 'DD/MM/YYYY', timeFormat: '24h', weekStart: 1 },
  us: { dateFormat: 'MM/DD/YYYY', timeFormat: '12h', weekStart: 0 },
};
export const TIME_FORMATS = ['24h', '12h'];
export const DEFAULT_TZ = 'Europe/Zurich';

const pad = (n) => String(n).padStart(2, '0');

// Giorno, mese, anno, ora e minuti di un istante nel fuso indicato.
function parts(date, tz) {
  const out = {};
  for (const p of new Intl.DateTimeFormat('en-GB', { timeZone: tz || DEFAULT_TZ, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(date)) out[p.type] = p.value;
  return { y: +out.year, m: +out.month, d: +out.day, h: +out.hour, min: +out.minute };
}

// Una data solo-giorno ("2026-11-03") è un giorno di calendario, non un istante: non si sposta con il fuso.
const asParts = (value, tz) => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) { const [y, m, d] = value.split('-').map(Number); return { y, m, d, h: 0, min: 0, dateOnly: true }; }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : parts(date, tz);
};

const monthName = (m, locale, style = 'long') => new Date(Date.UTC(2026, m - 1, 15)).toLocaleDateString(locale || 'it', { month: style, timeZone: 'UTC' });

export function formatDate(value, g = {}, locale = 'it') {
  const p = asParts(value, g?.timezone);
  if (!p) return '';
  const fmt = g?.dateFormat ?? null;
  if (!fmt) return new Date(Date.UTC(p.y, p.m - 1, p.d, 12)).toLocaleDateString(locale || 'it', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });   // predefinito: «3 novembre 2026»
  return fmt.replace(/YYYY|MMMM|MMM|MM|M|DD|D/g, (t) => ({ YYYY: p.y, MMMM: monthName(p.m, locale), MMM: monthName(p.m, locale, 'short').replace(/\.$/, ''), MM: pad(p.m), M: p.m, DD: pad(p.d), D: p.d })[t]);
}

export function formatTime(value, g = {}) {
  const p = asParts(value, g?.timezone);
  if (!p || p.dateOnly) return '';
  if (g?.timeFormat === '12h') return `${p.h % 12 || 12}:${pad(p.min)} ${p.h < 12 ? 'AM' : 'PM'}`;
  return `${pad(p.h)}:${pad(p.min)}`;
}

// Data e ora insieme, per l'admin. Senza impostazioni: «03.11.2026 14:30» (fuso svizzero), in inglese «11/03/2026 14:30». `locale` = lingua dell'admin.
export function formatStamp(value, g = {}, locale = g?.cmsLanguage ?? 'it') {
  if (value == null || value === '') return '';
  const p = asParts(value, g?.timezone);
  if (!p) return '';
  const date = formatDate(value, { ...g, dateFormat: g?.dateFormat ?? (locale === 'en' ? 'MM/DD/YYYY' : 'DD.MM.YYYY') }, locale);
  return p.dateOnly ? date : `${date} ${formatTime(value, g)}`;
}
