// Creazione di un articolo IN BOZZA da un programma esterno (POST /api/posts). Non pubblica mai: l'articolo compare in Articoli e un admin lo
// controlla e lo pubblica. Il testo arriva in markdown semplice o in testo piano, viene convertito e poi sanificato come ogni testo ricco;
// l'immagine (base64, solo JPG/PNG/WebP) passa dalla stessa elaborazione dei caricamenti dell'admin (ricodifica in WebP, niente metadati).
import crypto from 'node:crypto';
import { query, one } from './db.mjs';
import { audit } from './audit.mjs';
import { getDoc, saveDraft, createPost } from './docs.mjs';
import { saveUpload, deleteMedia, maxUploadBytes, UploadError } from './media.mjs';
import { requireTemplate } from './template.mjs';
import { sanitizeRich } from '../render/sanitize.mjs';
import { baseOf } from '../render/translations.mjs';

export const LIMITS = { title: 200, text: 100_000, alt: 300, filename: 100 };
export const postsPerHour = () => Math.max(1, +process.env.API_POSTS_PER_HOUR || 20);

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Formattazione dentro una riga (già escapata): **grassetto**, *corsivo*, [testo](https://indirizzo). Gli indirizzi ammessi sono solo http(s) e mailto.
function inline(s) {
  return esc(s)
    .replace(/\[([^\]\n]{1,200})\]\(((?:https?:\/\/|mailto:)[^\s()<>"]{1,500})\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
}

// Markdown semplice → HTML: paragrafi (righe vuote), titoli (# ## ### → h2 h2 h3), elenchi (- * 1.), citazioni (>). Niente HTML grezzo: tutto è escapato.
export function textToHtml(text) {
  const out = [];
  for (const block of String(text).replace(/\r\n?/g, '\n').split(/\n{2,}/)) {
    const lines = block.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim());
    if (!lines.length) continue;
    const head = /^(#{1,6})\s+(.+)$/.exec(lines[0]);
    if (head && lines.length === 1) { const n = head[1].length <= 2 ? 2 : Math.min(head[1].length, 6); out.push(`<h${n}>${inline(head[2])}</h${n}>`); continue; }
    if (lines.every((l) => /^[-*]\s+/.test(l))) { out.push(`<ul>${lines.map((l) => `<li>${inline(l.replace(/^[-*]\s+/, ''))}</li>`).join('')}</ul>`); continue; }
    if (lines.every((l) => /^\d+[.)]\s+/.test(l))) { out.push(`<ol>${lines.map((l) => `<li>${inline(l.replace(/^\d+[.)]\s+/, ''))}</li>`).join('')}</ol>`); continue; }
    if (lines.every((l) => /^>\s?/.test(l))) { out.push(`<blockquote><p>${lines.map((l) => inline(l.replace(/^>\s?/, ''))).join('<br>')}</p></blockquote>`); continue; }
    out.push(`<p>${lines.map(inline).join('<br>')}</p>`);
  }
  return sanitizeRich(out.join(''));
}

const slugOf = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '') || 'articolo';

// Immagine in base64 (anche con il prefisso data:image/...;base64,) → buffer. Solo raster riconosciuto dai byte iniziali: niente SVG.
function decodeImage(data) {
  const b64 = String(data ?? '').replace(/^data:image\/(?:jpeg|png|webp);base64,/, '').replace(/\s+/g, '');
  if (!b64 || b64.length > Math.ceil(maxUploadBytes() * 4 / 3) + 8 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64) || b64.length % 4 === 1) throw new UploadError("L'immagine non è in base64 valido o supera il peso massimo.");
  const buf = Buffer.from(b64, 'base64');
  const jpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const png = buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const webp = buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP';
  if (!jpeg && !png && !webp) throw new UploadError("L'immagine deve essere JPG, PNG o WebP.");
  return buf;
}

// input: { title, text, image?: { data, filename?, alt? } }. Restituisce { ok, key } oppure { ok: false, status, error }.
export async function createApiPost(input, user) {
  const bad = (error, status = 422) => ({ ok: false, status, error });
  if (!input || typeof input !== 'object' || Array.isArray(input)) return bad('Corpo non valido: serve un oggetto JSON.', 400);
  const title = typeof input.title === 'string' ? input.title.replace(/\s+/g, ' ').trim() : '';
  if (title.length < 3 || title.length > LIMITS.title) return bad(`Il titolo (title) è obbligatorio, da 3 a ${LIMITS.title} caratteri.`);
  if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > LIMITS.text) return bad(`Il testo (text) è obbligatorio, massimo ${LIMITS.text} caratteri.`);
  const img = input.image;
  if (img != null && (typeof img !== 'object' || Array.isArray(img) || typeof img.data !== 'string')) return bad('image deve essere { "data": "<base64>", "filename": "...", "alt": "..." }.');
  if (img?.alt != null && (typeof img.alt !== 'string' || img.alt.length > LIMITS.alt)) return bad(`alt: massimo ${LIMITS.alt} caratteri.`);
  if (img?.filename != null && (typeof img.filename !== 'string' || img.filename.length > LIMITS.filename)) return bad(`filename: massimo ${LIMITS.filename} caratteri.`);

  const tpl = requireTemplate();
  if (!tpl.schema.blocks.blocks.some((b) => /\/blocks\/text\.json$/.test(b.$id ?? ''))) return bad('Il template attivo non ha il blocco «text»: gli articoli non si possono creare da qui.', 409);
  const html = textToHtml(input.text);
  if (!html) return bad('Il testo non contiene nulla di utilizzabile.');

  const since = new Date(Date.now() - 3600_000);
  const n = Number((await one("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'api-post' AND user_id = ? AND created_at > ?", [user.id, since])).n);
  if (n >= postsPerHour()) return bad(`Limite raggiunto: al massimo ${postsPerHour()} articoli all'ora.`, 429);

  let media = null;
  try {
    if (img) media = await saveUpload(decodeImage(img.data), img.filename || slugOf(title), user.id);
  } catch (e) {
    if (e instanceof UploadError) return bad(e.message);
    throw e;
  }

  const base = slugOf(title);
  let key = null; let last = null;
  for (let i = 1; i <= 20 && !key; i++) {
    const candidate = i === 1 ? base : `${base.slice(0, 55)}-${i}`;
    const r = await createPost({ title, slug: candidate, author: user.name }, user.id);
    if (r.ok) key = r.key; else last = r.error;
  }
  if (!key) { if (media) await deleteMedia(media.item?.path ?? media.path).catch(() => {}); return bad(last ?? "Non è stato possibile creare l'articolo.", 409); }

  const doc = await getDoc('post', key);
  const B = baseOf((await getDoc('site', 'main'))?.draft);
  const blockId = `testo-${crypto.randomBytes(3).toString('hex')}`;
  const path = media ? (media.item?.path ?? media.path) : null;
  await saveDraft('post', key, {
    ...doc.draft, status: 'draft',
    ...(path ? { image: { src: path, alt: { [B]: (img.alt ?? '').trim() || title } } } : {}),
    blocks: [{ id: blockId, type: 'text', surface: 'light', content: { [B]: html } }],
  }, user.id);
  await audit(user.id, 'api-post', `articolo «${title.slice(0, 80)}» in bozza (${key}) via API`);
  return { ok: true, key };
}
