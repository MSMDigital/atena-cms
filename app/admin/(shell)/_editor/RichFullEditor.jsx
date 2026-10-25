'use client';

// Editor visuale del testo (come l'editor di WordPress): barra in alto con formattazione, dimensione e colore del testo, sfondo, allineamento,
// elenchi, link, immagini della libreria media, video e vista «Codice HTML». Il dato salvato è HTML che passa SEMPRE da sanitizeRich
// (render/sanitize.mjs): ciò che il browser scrive nell'editor (b, i, div, rgb(), parole chiave per la dimensione...) viene riscritto in forma
// canonica, e ciò che non è ammesso sparisce. Usa i comandi del browser (execCommand): sono «deprecati» ma funzionano ovunque e non servono librerie.
import { useEffect, useRef, useState } from 'react';
import { sanitizeRich, videoEmbed } from '@/render/sanitize.mjs';
import MediaPicker from './MediaPicker';
import { useT } from '@/app/admin/_i18n/I18nProvider';

const FORMATS = [['p', 'Paragrafo'], ['h2', 'Titolo 2'], ['h3', 'Titolo 3'], ['h4', 'Titolo 4'], ['h5', 'Titolo 5'], ['h6', 'Titolo 6'], ['blockquote', 'Citazione']];
const SIZES = [['2', 'Piccolo'], ['3', 'Normale'], ['5', 'Grande'], ['6', 'Molto grande'], ['7', 'Enorme']];
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const THUMB = '/admin/media/thumb/';
const PUBLIC = '/assets/img/';

// Dal dato (già sanificato) all'HTML dell'area di modifica: le immagini si vedono dalla libreria, i video sono un segnaposto (l'admin non carica frame esterni).
const toEditor = (html, t) => sanitizeRich(html)
  .replace(/<img src="\/assets\/img\/([^"]+)"/g, (_, p) => `<img src="${THUMB}${p}"`)
  .replace(/<iframe src="([^"]+)"[^>]*><\/iframe>/g, (_, src) => `<div class="rf-video" contenteditable="false" data-embed="${src}">▶ ${t('Video {service} (si vede nel sito)', { service: src.includes('vimeo') ? 'Vimeo' : 'YouTube' })}</div>`);

// Dall'area di modifica al dato: normalizza i tag del browser, rimette gli indirizzi e i video veri, e sanifica.
function fromEditor(root) {
  const c = root.cloneNode(true);
  const swap = (sel, name) => c.querySelectorAll(sel).forEach((el) => { const n = document.createElement(name); n.innerHTML = el.innerHTML; if (el.getAttribute('style')) n.setAttribute('style', el.getAttribute('style')); el.replaceWith(n); });
  swap('b', 'strong'); swap('i', 'em'); swap('strike, del', 's'); swap('div:not(.rf-video)', 'p');
  let html = c.innerHTML
    .replace(/<img([^>]*?) src="\/admin\/media\/thumb\/([^"?]+)(?:\?[^"]*)?"/g, (_, rest, p) => `<img${rest} src="${PUBLIC}${p}"`)
    .replace(/<div[^>]*class="rf-video"[^>]*data-embed="([^"]+)"[^>]*>[^<]*<\/div>/g, (_, src) => `<iframe src="${src}"></iframe>`);
  html = html.replace(/<p><br><\/p>/g, '<p></p>');
  return sanitizeRich(html);
}

// Testo incollato: via stili, script e commenti di Word o dei siti; poi sanificazione (restano solo i tag ammessi).
const cleanPaste = (html) => sanitizeRich(html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(style|script|head|title|template)[\s\S]*?<\/\1>/gi, ''));

export default function RichFullEditor({ value, onChange, label, pages = [], media = [], addMedia, maxMb }) {
  const t = useT();
  const area = useRef(null);
  const last = useRef(null);          // ultimo valore scritto da qui o letto da fuori: evita di riscrivere l'area (e perdere il cursore) a ogni battuta
  const range = useRef(null);
  const [code, setCode] = useState(null);       // testo del codice HTML se la vista codice è aperta
  const [note, setNote] = useState(null);
  const [panel, setPanel] = useState(null);     // 'link' | 'video'
  const [link, setLink] = useState({ type: 'page', page: pages[0]?.key ?? 'home', url: 'https://', channel: 'phone' });
  const [video, setVideo] = useState('');
  const [picker, setPicker] = useState(false);

  useEffect(() => {
    if (code !== null || value === last.current) return;
    last.current = value ?? '';
    if (area.current) area.current.innerHTML = toEditor(value ?? '', t);
  }, [value, code]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const save = () => {
      const sel = document.getSelection();
      if (sel?.rangeCount && area.current?.contains(sel.anchorNode)) range.current = sel.getRangeAt(0).cloneRange();
    };
    document.addEventListener('selectionchange', save);
    return () => document.removeEventListener('selectionchange', save);
  }, []);

  const emit = () => {
    const v = fromEditor(area.current);
    if (v !== last.current) { last.current = v; onChange(v); }
  };
  const restore = () => {
    area.current.focus();
    if (range.current) { const sel = document.getSelection(); sel.removeAllRanges(); sel.addRange(range.current); }
  };
  // `css`: i comandi di colore, dimensione e allineamento scrivono style="…"; gli altri tag (strong, em, u…).
  const exec = (cmd, arg, css = false) => {
    restore();
    document.execCommand('styleWithCSS', false, css);
    document.execCommand('defaultParagraphSeparator', false, 'p');
    document.execCommand(cmd, false, arg);
    emit();
  };
  const html = (h) => { restore(); document.execCommand('insertHTML', false, h); emit(); };

  const applyLink = () => {
    const href = link.type === 'page' ? `page:${link.page}` : link.type === 'channel' ? `channel:${link.channel}` : link.url.trim();
    if (!href || href === 'page:') return;
    const name = link.type === 'page' ? (pages.find((p) => p.key === link.page)?.name ?? link.page) : link.type === 'channel' ? link.channel : link.url;
    restore();
    if (document.getSelection().isCollapsed) html(`<a href="${esc(href)}">${esc(name)}</a>`); else exec('createLink', href);
    setPanel(null);
  };
  const applyVideo = () => {
    const embed = videoEmbed(video);
    if (!embed) { setNote(t('Indirizzo non riconosciuto: sono ammessi i video di YouTube e di Vimeo.')); return; }
    setNote(null);
    html(`<div class="rf-video" contenteditable="false" data-embed="${embed}">▶ ${t('Video {service} (si vede nel sito)', { service: embed.includes('vimeo') ? 'Vimeo' : 'YouTube' })}</div><p><br></p>`);
    setVideo(''); setPanel(null);
  };
  const pickImage = (item) => {
    setPicker(false);
    html(`<img src="${THUMB}${item.path}" alt="${esc(item.alt?.it ?? item.alt ?? item.name ?? '')}">`);
  };
  const openCode = () => { emit(); setCode(last.current ?? value ?? ''); setNote(null); };
  const closeCode = () => {
    const clean = sanitizeRich(code);
    if (clean !== code.trim()) setNote(t('Il codice è stato ripulito: restano solo i tag ammessi (testo, titoli, elenchi, link, immagini della libreria, video YouTube e Vimeo).'));
    else setNote(null);
    last.current = null;
    onChange(clean);
    setCode(null);
  };

  const keep = (e) => e.preventDefault();   // i pulsanti non tolgono la selezione al testo
  const btn = (title, children, onClick, extra = {}) => <button type="button" title={t(title)} aria-label={t(title)} onMouseDown={keep} onClick={onClick} {...extra}>{typeof children === 'string' ? t(children) : children}</button>;

  return (
    <div className="rf">
      <div className="rich__bar rf__bar" role="toolbar" aria-label={t('Formattazione: {label}', { label: label ?? '' })}>
        <select aria-label={t('Formato del paragrafo')} value="" onChange={(e) => { if (e.target.value) exec('formatBlock', `<${e.target.value}>`); }} disabled={code !== null}>
          <option value="">{t('Formato…')}</option>
          {FORMATS.map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
        </select>
        <select aria-label={t('Dimensione del testo')} value="" onChange={(e) => { if (e.target.value) exec('fontSize', e.target.value, true); }} disabled={code !== null}>
          <option value="">{t('Dimensione…')}</option>
          {SIZES.map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
        </select>
        <span className="rich__sep" />
        {btn('Grassetto', <b>{t('Grassetto').charAt(0).toUpperCase()}</b>, () => exec('bold'), { disabled: code !== null })}
        {btn('Corsivo', <i>{t('Corsivo').charAt(0).toUpperCase()}</i>, () => exec('italic'), { disabled: code !== null })}
        {btn('Sottolineato', <u>{t('Sottolineato').charAt(0).toUpperCase()}</u>, () => exec('underline'), { disabled: code !== null })}
        {btn('Barrato', <s>{t('Barrato').charAt(0).toUpperCase()}</s>, () => exec('strikeThrough'), { disabled: code !== null })}
        {btn('Apice', <>x<sup>2</sup></>, () => exec('superscript'), { disabled: code !== null })}
        {btn('Pedice', <>x<sub>2</sub></>, () => exec('subscript'), { disabled: code !== null })}
        <span className="rich__sep" />
        <label className="rf__color" title={t('Colore del testo')}><span aria-hidden="true">A</span><input type="color" aria-label={t('Colore del testo')} defaultValue="#c0392b" disabled={code !== null} onChange={(e) => exec('foreColor', e.target.value, true)} /></label>
        <label className="rf__color rf__color--bg" title={t('Colore di sfondo')}><span aria-hidden="true">▮</span><input type="color" aria-label={t('Colore di sfondo del testo')} defaultValue="#fff3a3" disabled={code !== null} onChange={(e) => exec('hiliteColor', e.target.value, true)} /></label>
        {btn('Togli la formattazione', 'Tx', () => exec('removeFormat'), { disabled: code !== null })}
        <span className="rich__sep" />
        {btn('Allinea a sinistra', '⇤', () => exec('justifyLeft', null, true), { disabled: code !== null })}
        {btn('Centra', '↔', () => exec('justifyCenter', null, true), { disabled: code !== null })}
        {btn('Allinea a destra', '⇥', () => exec('justifyRight', null, true), { disabled: code !== null })}
        {btn('Giustifica', '☰', () => exec('justifyFull', null, true), { disabled: code !== null })}
        <span className="rich__sep" />
        {btn('Elenco puntato', '• Elenco', () => exec('insertUnorderedList'), { disabled: code !== null })}
        {btn('Elenco numerato', '1. Elenco', () => exec('insertOrderedList'), { disabled: code !== null })}
        {btn('Linea di separazione', '―', () => exec('insertHorizontalRule'), { disabled: code !== null })}
        <span className="rich__sep" />
        {btn('Link', 'Link', () => setPanel(panel === 'link' ? null : 'link'), { disabled: code !== null, 'aria-expanded': panel === 'link' })}
        {btn('Togli il link', 'Senza link', () => exec('unlink'), { disabled: code !== null })}
        {btn('Immagine dalla libreria', 'Immagine', () => { restore(); setPicker(true); }, { disabled: code !== null })}
        {btn('Video (YouTube o Vimeo)', 'Video', () => setPanel(panel === 'video' ? null : 'video'), { disabled: code !== null, 'aria-expanded': panel === 'video' })}
        <span className="rich__sep" />
        {btn('Annulla', '↶', () => exec('undo'), { disabled: code !== null })}
        {btn('Ripeti', '↷', () => exec('redo'), { disabled: code !== null })}
        {btn('Codice HTML', '</> Codice', code === null ? openCode : closeCode, { 'aria-pressed': code !== null, className: code !== null ? 'is-on' : undefined })}
      </div>

      {panel === 'link' && code === null && (
        <div className="rich__link">
          <select aria-label={t('Tipo di link')} value={link.type} onChange={(e) => setLink({ ...link, type: e.target.value })}>
            <option value="page">{t('Pagina del sito')}</option><option value="url">{t('Indirizzo esterno')}</option><option value="channel">{t('Contatto')}</option>
          </select>
          {link.type === 'page' && <select aria-label={t('Pagina')} value={link.page} onChange={(e) => setLink({ ...link, page: e.target.value })}>{pages.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}</select>}
          {link.type === 'url' && <input aria-label={t('Indirizzo')} value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value })} />}
          {link.type === 'channel' && <select aria-label={t('Contatto')} value={link.channel} onChange={(e) => setLink({ ...link, channel: e.target.value })}>{[['phone', 'Telefono'], ['mobile', 'Mobile'], ['whatsapp', 'WhatsApp'], ['email', 'Email']].map(([c, n]) => <option key={c} value={c}>{t(n)}</option>)}</select>}
          <button type="button" className="mini mini--primary" onClick={applyLink}>{t('Inserisci')}</button>
          <span className="fld__help">{t('sul testo selezionato')}</span>
        </div>
      )}
      {panel === 'video' && code === null && (
        <div className="rich__link">
          <input aria-label={t('Indirizzo del video')} placeholder={t('https://www.youtube.com/watch?v=… oppure https://vimeo.com/…')} value={video} onChange={(e) => setVideo(e.target.value)} />
          <button type="button" className="mini mini--primary" onClick={applyVideo}>{t('Inserisci')}</button>
          <span className="fld__help">{t('YouTube (senza cookie) o Vimeo')}</span>
        </div>
      )}

      {code === null ? (
        <div ref={area} className="rf__area prose" contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label={label} spellCheck
          onInput={emit} onBlur={emit}
          onDoubleClick={(e) => { if (e.target.tagName === 'IMG') { const alt = window.prompt(t('Testo alternativo dell\'immagine (per chi non la vede e per Google)'), e.target.getAttribute('alt') ?? ''); if (alt !== null) { e.target.setAttribute('alt', alt); emit(); } } }}
          onPaste={(e) => {
            e.preventDefault();
            const h = e.clipboardData.getData('text/html');
            const t = e.clipboardData.getData('text/plain');
            const clean = h ? cleanPaste(h) : '';
            document.execCommand('insertHTML', false, clean || esc(t).replace(/\r?\n/g, '<br>'));
            emit();
          }} />
      ) : (
        <textarea className="rf__code" rows={14} value={code} onChange={(e) => setCode(e.target.value)} onBlur={() => { const clean = sanitizeRich(code); if (clean !== last.current) { last.current = clean; onChange(clean); } }} aria-label={t('Codice HTML: {label}', { label: label ?? '' })} spellCheck={false} />
      )}
      {note && <p className="fld__help" role="status">{note}</p>}
      {picker && <MediaPicker media={media} current={null} maxMb={maxMb} onPick={pickImage} onUploaded={(item) => addMedia?.(item)} onClose={() => setPicker(false)} />}
    </div>
  );
}
