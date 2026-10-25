'use client';

// Form generato dagli schemi (schema/): ogni nodo dello schema diventa un campo. Nessun campo è scritto a mano per un blocco specifico.
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { INLINE, BLOCK } from '@/schema/common.mjs';
import MediaPicker from './MediaPicker';
import { useT, useLang } from '@/app/admin/_i18n/I18nProvider';
import RichFullEditor from './RichFullEditor';
import { langName } from '@/render/locales.mjs';
import { keyOf } from '@/schema/blog.mjs';
import { createTermAction } from './actions';
import { sanitizeRich } from '@/render/sanitize.mjs';   // il testo si mostra solo dopo la sanificazione (mai HTML del dato così com'è)
import { singular, isVisible, summarize, newId, collectIds, labelFor, humanizeKey, keyLabel, uiOf } from '@/lib/schema-form.mjs';

// Il modello degli schemi (motore + template) arriva dal server: gli schemi del template attivo si conoscono solo a runtime.
// Si assegna durante il rendering, prima dei campi figli (c'è un solo editor per volta e un solo template attivo).
let model;
const FormCtx = createContext(null);
export function FormProvider({ value, children }) {
  model = value.model;
  return <FormCtx.Provider value={value}>{children}</FormCtx.Provider>;
}
const useForm = () => useContext(FormCtx);


// ---- utilità ------------------------------------------------------------------------------------------

const issuesAt = (issues, path) => issues.filter((i) => i.path === path);
const issuesUnder = (issues, path) => issues.filter((i) => i.path === path || i.path.startsWith(path + '/'));
const SOFT = new Set(['Campo obbligatorio', 'Non può essere vuoto']);

function cloneWithNewIds(value, taken) {
  const c = structuredClone(value);
  const walk = (n) => {
    if (Array.isArray(n)) n.forEach(walk);
    else if (n && typeof n === 'object') {
      if (typeof n.id === 'string' && n.type) { const id = newId(String(n.type), taken); taken.add(id); n.id = id; }
      Object.values(n).forEach(walk);
    }
  };
  walk(c);
  return c;
}

function Issues({ list }) {
  const t = useT();
  if (!list.length) return null;
  return (
    <ul className="fld__issues" role="alert">
      {list.map((i, k) => <li key={k} className={i.severity === 'warning' ? 'warn' : SOFT.has(i.message) ? 'soft' : 'bad'}>{t(i.message)}</li>)}
    </ul>
  );
}

function Labeled({ label, help, path, deep, required, onRemove, children, className = '' }) {
  const t = useT();
  const { issues } = useForm();
  const here = deep ? issuesUnder(issues, path) : issuesAt(issues, path);
  return (
    <div className={`fld ${className}${here.some((i) => i.severity === 'error') ? ' fld--bad' : ''}`} data-path={path}>
      {(label || onRemove) && (
        <div className="fld__head">
          <span className="fld__label">{label ? t(label) : label}{required && <abbr title={t('Obbligatorio')}> *</abbr>}</span>
          {onRemove && <button type="button" className="mini" onClick={onRemove}>{t('Rimuovi')}</button>}
        </div>
      )}
      {help && <p className="fld__help">{t(help)}</p>}
      {children}
      <Issues list={here} />
    </div>
  );
}

// Numero con testo libero (si può scrivere "4." senza che il campo si azzeri).
function NumInput({ value, onChange, min, max, label }) {
  const t = useT();
  const [text, setText] = useState(value == null ? '' : String(value));
  const last = useRef(value);
  useEffect(() => { if (value !== last.current) { setText(value == null ? '' : String(value)); last.current = value; } }, [value]);
  return (
    <input className="num" type="text" inputMode="decimal" aria-label={label ? t(label) : label} value={text}
      onChange={(e) => {
        const v = e.target.value; setText(v);
        const n = v.trim() === '' ? undefined : Number(v.replace(',', '.'));
        if (n === undefined || Number.isFinite(n)) { last.current = n; onChange(n); }
      }}
      title={min != null || max != null ? t('Da {min} a {max}', { min: min ?? '−∞', max: max ?? '+∞' }) : undefined}
    />
  );
}

// ---- testi con formattazione -------------------------------------------------------------------------------

function RichEditor({ value, onChange, mode, label }) {
  const t = useT();
  const { pages } = useForm();
  const ref = useRef(null);
  const [link, setLink] = useState(null);
  const block = mode === 'rich-block';
  const re = new RegExp(block ? BLOCK : INLINE);
  const ok = re.test(value ?? '');

  const edit = (fn) => {
    const ta = ref.current;
    const [next, a, b] = fn(ta.value, ta.selectionStart, ta.selectionEnd);
    onChange(next);
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(a, b); });
  };
  const wrap = (open, close) => edit((v, a, b) => { const sel = v.slice(a, b) || 'testo'; return [v.slice(0, a) + open + sel + close + v.slice(b), a + open.length, a + open.length + sel.length]; });
  const list = (tag) => edit((v, a, b) => {
    const lines = (v.slice(a, b) || 'voce').split('\n').map((l) => l.trim()).filter(Boolean);
    const ins = `<${tag}>${lines.map((l) => `<li>${l}</li>`).join('')}</${tag}>`;
    return [v.slice(0, a) + ins + v.slice(b), a, a + ins.length];
  });
  const insertLink = () => {
    const href = link.type === 'page' ? `page:${link.page}` : link.type === 'channel' ? `channel:${link.channel}` : link.url.replace(/"/g, '%22');
    if (!href || href === 'page:' || href === 'channel:') return;
    wrap(`<a href="${href}">`, '</a>');
    setLink(null);
  };

  return (
    <div className="rich">
      <div className="rich__bar" role="toolbar" aria-label={t('Formattazione: {label}', { label: label ? t(label) : '' })}>
        <button type="button" onClick={() => wrap('<strong>', '</strong>')} title={t('Grassetto')}><b>{t('Grassetto').charAt(0).toUpperCase()}</b></button>
        <button type="button" onClick={() => wrap('<em>', '</em>')} title={t('Corsivo')}><i>{t('Corsivo').charAt(0).toUpperCase()}</i></button>
        <button type="button" onClick={() => setLink(link ? null : { type: 'page', page: pages[0]?.key ?? 'home', url: 'https://' })} title={t('Link')} aria-expanded={!!link}>{t('Link')}</button>
        <button type="button" onClick={() => edit((v, a, b) => [v.slice(0, a) + '<br>' + v.slice(b), a + 4, a + 4])} title={t('A capo')}>↵</button>
        {block && (
          <>
            <span className="rich__sep" />
            <button type="button" onClick={() => wrap('<p>', '</p>')} title={t('Paragrafo')}>¶</button>
            <select aria-label={t('Titolo')} value="" onChange={(e) => { if (e.target.value) wrap(`<${e.target.value}>`, `</${e.target.value}>`); }}>
              <option value="">{t('Titolo…')}</option>
              {['h2', 'h3', 'h4', 'h5', 'h6'].map((h) => <option key={h} value={h}>{h.toUpperCase()}</option>)}
            </select>
            <button type="button" onClick={() => list('ul')} title={t('Elenco puntato')}>{t('• Elenco')}</button>
            <button type="button" onClick={() => list('ol')} title={t('Elenco numerato')}>{t('1. Elenco')}</button>
            <button type="button" onClick={() => wrap('<blockquote>', '</blockquote>')} title={t('Citazione')}>“ ”</button>
          </>
        )}
      </div>
      {link && (
        <div className="rich__link">
          <select aria-label={t('Tipo di link')} value={link.type} onChange={(e) => setLink({ ...link, type: e.target.value })}>
            <option value="page">{t('Pagina del sito')}</option><option value="url">{t('Indirizzo esterno')}</option><option value="channel">{t('Contatto')}</option>
          </select>
          {link.type === 'page' && <select aria-label={t('Pagina')} value={link.page} onChange={(e) => setLink({ ...link, page: e.target.value })}>{pages.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}</select>}
          {link.type === 'url' && <input aria-label={t('Indirizzo')} value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value })} />}
          {link.type === 'channel' && <select aria-label={t('Contatto')} value={link.channel ?? 'phone'} onChange={(e) => setLink({ ...link, channel: e.target.value })}>{['phone', 'mobile', 'whatsapp', 'email'].map((c) => <option key={c} value={c}>{t(labelFor(c))}</option>)}</select>}
          <button type="button" className="mini mini--primary" onClick={insertLink}>{t('Inserisci')}</button>
          <span className="fld__help">{t('sul testo selezionato')}</span>
        </div>
      )}
      <textarea ref={ref} rows={block ? 8 : 3} value={value ?? ''} aria-label={label} spellCheck onChange={(e) => onChange(e.target.value)} />
      {!ok && <p className="fld__issues"><span className="bad">{t('Contiene formattazione non ammessa: usa solo i pulsanti sopra.')}</span></p>}
      {ok && /</.test(value ?? '') && (
        <div className="rich__preview" aria-label={t('Anteprima del testo')} onClick={(e) => e.preventDefault()}
          dangerouslySetInnerHTML={{ __html: sanitizeRich(value ?? '').replace(/href="[^"]*"/g, 'href="#"') }} />
      )}
    </div>
  );
}

// ---- testo per lingua -------------------------------------------------------------------------------------------

function I18nField({ schema, value, onChange, path, optional, label, help, widget, onRemove }) {
  const t = useT();
  const { locales, defaultLocale, pages, media, addMedia, maxUploadMb, activeLang } = useForm();
  const v = value ?? {};
  const shown = activeLang ? [activeLang] : [...new Set([defaultLocale, ...locales])];   // con le schede di lingua si mostra solo quella aperta
  const tl = label ? t(label) : '';
  const set = (loc, text) => {
    const next = { ...v, [loc]: text };
    for (const l of Object.keys(next)) if (l !== defaultLocale && next[l] === '') delete next[l];
    if (optional && !Object.values(next).some((x) => x !== '')) onChange(undefined); else onChange(next);
  };
  const dschema = model.deref(schema).s;
  const spec = dschema.properties?.[defaultLocale] ?? Object.values(dschema.patternProperties ?? {})[0] ?? {};
  const max = spec.maxLength;
  return (
    <Labeled label={label} help={help} path={path} deep required={!optional} onRemove={onRemove}>
      {shown.map((loc) => (
        <div key={loc} className="loc">
          {shown.length > 1 && <span className="loc__tag">{loc.toUpperCase()}</span>}
          {widget === 'rich-full'
            ? <RichFullEditor value={v[loc]} onChange={(x) => set(loc, x)} label={`${tl} ${loc}`} pages={pages} media={media} addMedia={addMedia} maxMb={maxUploadMb} />
            : widget === 'rich-inline' || widget === 'rich-block'
            ? <RichEditor value={v[loc]} onChange={(x) => set(loc, x)} mode={widget} label={`${tl} ${loc}`} />
            : widget === 'textarea'
              ? <textarea rows={3} value={v[loc] ?? ''} aria-label={`${tl} ${loc}`} onChange={(e) => set(loc, e.target.value)} />
              : <input value={v[loc] ?? ''} aria-label={`${tl} ${loc}`} maxLength={max} onChange={(e) => set(loc, e.target.value)} />}
        </div>
      ))}
    </Labeled>
  );
}

// ---- immagine con punto focale ---------------------------------------------------------------------------------------

function FocalPicker({ src, focal, onPick }) {
  const t = useT();
  const pick = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    onPick({ x: Math.round(((e.clientX - r.left) / r.width) * 100), y: Math.round(((e.clientY - r.top) / r.height) * 100) });
  };
  return (
    <div className="focal" onClick={onPick ? pick : undefined} title={onPick ? t('Clicca per scegliere il punto che deve restare al centro') : undefined}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/admin/media/thumb/${src}`} alt="" />
      {focal && <span className="focal__dot" style={{ left: `${focal.x}%`, top: `${focal.y}%` }} />}
    </div>
  );
}

// Pulsante che apre il selettore della libreria. onPick riceve l'elemento scelto (percorso, testo alternativo predefinito, ...).
function PickButton({ current, label, onPick, children }) {
  const { media, addMedia, maxUploadMb } = useForm();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn" aria-label={label} onClick={() => setOpen(true)}>{children}</button>
      {open && <MediaPicker media={media} current={current} maxMb={maxUploadMb} onUploaded={addMedia} onClose={() => setOpen(false)} onPick={(item) => { onPick(item); setOpen(false); }} />}
    </>
  );
}

function ImageField({ schema, value, onChange, path, label, help, onRemove }) {
  const t = useT();
  const { media, locales, defaultLocale, baseLang } = useForm();
  const s = model.deref(schema).s;
  const v = value ?? { src: '', alt: { [defaultLocale ?? 'it']: '' } };
  const set = (part) => { const next = { ...v, ...part }; for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k]; onChange(next); };
  const info = media.find((i) => i.path === v.src);
  // Con una nuova immagine, il testo alternativo predefinito della libreria si propone solo se il campo è ancora vuoto.
  // Il testo alternativo di ogni lingua mostrata viene dalla libreria (la lingua di base dalle colonne, le altre da quelle per lingua).
  const choose = (item) => {
    const filled = {};
    for (const l of new Set([defaultLocale, ...(locales ?? [])])) {
      if (!l || v.alt?.[l]) continue;
      const text = l === (baseLang ?? 'it') ? item.alt : item.i18n?.[l]?.alt;
      if (text) filled[l] = text;
    }
    set({ src: item.path, ...(Object.keys(filled).length ? { alt: { ...v.alt, ...filled } } : {}) });
  };
  return (
    <Labeled label={label} help={help} path={path} onRemove={onRemove} className="imgfield">
      <div className="imgfield__grid">
        <div>
          {v.src ? <FocalPicker src={v.src} focal={v.focal} onPick={(f) => set({ focal: f })} /> : <div className="focal focal--empty">{t('Nessuna immagine')}</div>}
          {v.src && <p className="fld__help">{v.focal ? t("Clicca sull'immagine per il punto focale ({x}%, {y}%).", { x: v.focal.x, y: v.focal.y }) : t("Clicca sull'immagine per il punto focale.")}</p>}
        </div>
        <div className="imgfield__fields">
          <Labeled label="File" path={`${path}/src`} required>
            <div className="imgfield__file">
              <PickButton current={v.src} label={v.src ? t('{label}: cambia immagine', { label: t(label ?? 'Immagine') }) : t('{label}: scegli immagine', { label: t(label ?? 'Immagine') })} onPick={choose}>{v.src ? t('Cambia immagine') : t('Scegli immagine')}</PickButton>
              {v.src && <span className="imgfield__name" title={v.src}>{info?.name ?? v.src}{info?.missing ? ` ${t('(file mancante)')}` : ''}</span>}
            </div>
          </Labeled>
          <I18nField schema={s.properties.alt} value={v.alt} onChange={(a) => set({ alt: a ?? { [defaultLocale ?? 'it']: '' } })} path={`${path}/alt`} label="Testo alternativo" help={s.properties.alt.description} widget="text" />
          <div className="imgfield__focal">
            <button type="button" className="mini" onClick={() => set({ focal: v.focal ? undefined : { x: 50, y: 50 } })}>{v.focal ? t('Togli punto focale') : t('Imposta punto focale')}</button>
            {v.focal && <button type="button" className="mini" onClick={() => set({ focalMobile: v.focalMobile ? undefined : { ...v.focal } })}>{v.focalMobile ? t('Stesso su mobile') : t('Diverso su mobile')}</button>}
          </div>
          {v.focalMobile && <p className="fld__help">{t('Su mobile: {x}%, {y}%.', { x: v.focalMobile.x, y: v.focalMobile.y })} <button type="button" className="mini" onClick={() => set({ focalMobile: { x: v.focal.x, y: v.focal.y } })}>{t('Copia dal desktop')}</button></p>}
        </div>
      </div>
    </Labeled>
  );
}

// Campo testuale che contiene il percorso di un'immagine della libreria (dati del sito: logo, favicon...).
function MediaPathField({ value, onChange, path, label, help, optional }) {
  const t = useT();
  const { media } = useForm();
  const info = media.find((i) => i.path === value);
  return (
    <Labeled label={label} help={help} path={path} required={!optional}>
      <div className="imgfield__file">
        {value && <span className="mthumb">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={`/admin/media/thumb/${value}`} alt="" /></span>}
        <PickButton current={value} label={value ? t('{label}: cambia immagine', { label: t(label ?? '') }) : t('{label}: scegli immagine', { label: t(label ?? '') })} onPick={(item) => onChange(item.path)}>{value ? t('Cambia immagine') : t('Scegli immagine')}</PickButton>
        {value && <span className="imgfield__name" title={value}>{info?.name ?? value}{info?.missing ? ` ${t('(file mancante)')}` : ''}</span>}
        {value && optional && <button type="button" className="mini" onClick={() => onChange(undefined)}>{t('Togli')}</button>}
      </div>
    </Labeled>
  );
}

// Codice (HTML, CSS, JS di tracciamento, testo di llms.txt): un'unica casella di testo, non per lingua, senza sanificazione.
// Riservato a un admin (il server lo impone: lib/content-guard.mjs); qui solo un promemoria visivo.
function CodeField({ value, onChange, path, label, help, optional }) {
  const t = useT();
  return (
    <Labeled label={label} help={help} path={path} required={!optional}>
      <textarea className="code" spellCheck={false} rows={6} aria-label={label ? t(label) : label} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' && optional ? undefined : e.target.value)} />
    </Labeled>
  );
}

// ---- link -----------------------------------------------------------------------------------------------------------------

function LinkField({ value, onChange, path, label, help, onRemove }) {
  const t = useT();
  const lk = t(label ?? 'Link');
  const { pages } = useForm();
  const v = value ?? { type: 'page', page: pages[0]?.key ?? 'home' };
  const change = (type) => onChange({ page: { type: 'page', page: pages[0]?.key ?? 'home' }, url: { type: 'url', url: '' }, anchor: { type: 'anchor', anchor: '' }, channel: { type: 'channel', channel: 'phone' } }[type]);
  return (
    <Labeled label={label} help={help} path={path} deep onRemove={onRemove}>
      <div className="linkfield">
        <select value={v.type} aria-label={t('{label}: tipo', { label: lk })} onChange={(e) => change(e.target.value)}>
          {['page', 'url', 'anchor', 'channel'].map((x) => <option key={x} value={x}>{t(labelFor(x))}</option>)}
        </select>
        {v.type === 'page' && (
          <>
            <select value={v.page} aria-label={t('{label}: pagina', { label: lk })} onChange={(e) => onChange({ ...v, page: e.target.value })}>
              {!pages.some((p) => p.key === v.page) && <option value={v.page}>{v.page} {t('(non esiste)')}</option>}
              {pages.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
            </select>
            <input placeholder={t('ancora (facoltativa)')} aria-label={t('{label}: ancora', { label: lk })} value={v.anchor ?? ''} onChange={(e) => { const { anchor, ...rest } = v; onChange(e.target.value ? { ...rest, anchor: e.target.value } : rest); }} />
          </>
        )}
        {v.type === 'url' && <input placeholder="https://…" aria-label={t('{label}: indirizzo', { label: lk })} value={v.url} onChange={(e) => onChange({ ...v, url: e.target.value })} />}
        {v.type === 'anchor' && <input placeholder={t('nome-ancora')} aria-label={t('{label}: ancora', { label: lk })} value={v.anchor} onChange={(e) => onChange({ ...v, anchor: e.target.value })} />}
        {v.type === 'channel' && (
          <select value={v.channel} aria-label={t('{label}: contatto', { label: lk })} onChange={(e) => onChange({ ...v, channel: e.target.value })}>
            {['phone', 'mobile', 'whatsapp', 'email'].map((c) => <option key={c} value={c}>{t(labelFor(c))}</option>)}
          </select>
        )}
      </div>
    </Labeled>
  );
}

// ---- campi semplici --------------------------------------------------------------------------------------------------------

function EnumField({ s, value, onChange, path, optional, label, help }) {
  const t = useT();
  const shown = value ?? s.default ?? '';
  return (
    <Labeled label={label} help={help} path={path} required={!optional}>
      <select value={String(shown)} aria-label={label ? t(label) : label} onChange={(e) => { const raw = e.target.value; onChange(raw === '' ? undefined : s.enum.find((x) => String(x) === raw)); }}>
        {optional && s.default === undefined && <option value="">—</option>}
        {s.enum.map((x) => <option key={String(x)} value={String(x)}>{t(labelFor(x))}</option>)}
      </select>
    </Labeled>
  );
}

function PageSelect({ value, onChange, path, label, help, nullable, optional }) {
  const t = useT();
  const { pages } = useForm();
  return (
    <Labeled label={label} help={help} path={path} required={!optional}>
      <select value={value ?? ''} aria-label={label ? t(label) : label} onChange={(e) => onChange(e.target.value || (nullable ? null : undefined))}>
        {nullable && <option value="">{t('— direttamente sotto la home —')}</option>}
        {pages.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
        {value && !pages.some((p) => p.key === value) && <option value={value}>{value} {t('(non esiste)')}</option>}
      </select>
    </Labeled>
  );
}

function SharedRef({ value, onChange, path }) {
  const t = useT();
  const { sharedKeys } = useForm();
  return (
    <Labeled label="Blocco condiviso" path={path} required help="Si modifica in Condivisi: il cambiamento vale in tutte le pagine che lo usano.">
      <select value={value ?? ''} aria-label={t('Blocco condiviso')} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t('— scegli —')}</option>
        {sharedKeys.map((k) => <option key={k} value={k}>{k}</option>)}
        {value && !sharedKeys.includes(value) && <option value={value}>{value} {t('(non esiste)')}</option>}
      </select>
    </Labeled>
  );
}

// Termini di un articolo (tag o categorie): una casella ciascuno, più un campo per crearne uno nuovo al volo.
function TermPicker({ kind, noun, value, onChange, path, label, help }) {
  const t = useT();
  const ctx = useForm();
  const [created, setCreated] = useState([]);
  const [draft, setDraft] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const base = ctx[kind] ?? [];
  const list = [...base, ...created.filter((c) => !base.some((b) => b.key === c.key))];
  const sel = Array.isArray(value) ? value : [];
  const toggle = (k) => onChange(sel.includes(k) ? sel.filter((x) => x !== k) : [...sel, k]);
  const create = async () => {
    const name = draft.trim();
    if (!name || busy) return;
    const known = list.find((x) => x.name.toLowerCase() === name.toLowerCase() || x.key === keyOf(name));
    if (known) { if (!sel.includes(known.key)) onChange([...sel, known.key]); setDraft(''); setMsg(null); return; }
    setBusy(true);
    const r = await createTermAction(kind, name);
    setBusy(false);
    if (!r.ok) { setMsg(t(r.error)); return; }
    setCreated([...created, { key: r.key, name: r.name }]);
    if (!sel.includes(r.key)) onChange([...sel, r.key]);
    setDraft(''); setMsg(null);
  };
  return (
    <Labeled label={label} help={help} path={path}>
      {list.length === 0 && <p className="fld__help">{t('Nessun {noun} ancora: scrivine uno qui sotto.', { noun: t(noun) })}</p>}
      <div className="catpick">
        {list.map((x) => <label key={x.key} className="check"><input type="checkbox" checked={sel.includes(x.key)} onChange={() => toggle(x.key)} /> {x.name}</label>)}
        {sel.filter((k) => !list.some((x) => x.key === k)).map((k) => <label key={k} className="check"><input type="checkbox" checked onChange={() => toggle(k)} /> {k} {t('(non esiste)')}</label>)}
      </div>
      <div className="termadd">
        <input type="text" value={draft} maxLength={60} placeholder={t('Nuovo {noun}: scrivi e premi Invio', { noun: t(noun) })} aria-label={t('Aggiungi un {noun}', { noun: t(noun) })}
          onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); create(); } }} />
        <button type="button" className="btn" disabled={!draft.trim() || busy} onClick={create}>{busy ? t('Creo…') : t('+ Aggiungi {noun}', { noun: t(noun) })}</button>
      </div>
      {msg && <p className="fld__help" role="alert">{msg}</p>}
    </Labeled>
  );
}

const TagPicker = (props) => <TermPicker kind="tags" noun="tag" {...props} />;
const CategoryPicker = (props) => <TermPicker kind="categories" noun="categoria" {...props} />;

// Autore: uno degli utenti del CMS (si salva il nome). Un nome che non è più tra gli utenti resta scelto finché non lo si cambia.
function AuthorRef({ value, onChange, path, label, help, optional }) {
  const t = useT();
  const { authors } = useForm();
  const list = authors ?? [];
  return (
    <Labeled label={label} help={help} path={path}>
      <select value={value ?? ''} aria-label={label ? t(label) : label} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">{t('— nessuno —')}</option>
        {list.map((n) => <option key={n} value={n}>{n}</option>)}
        {value && !list.includes(value) && <option value={value}>{value}</option>}
      </select>
    </Labeled>
  );
}

// Un autore (per nome utente) da una lista: per filtrare un elenco di articoli.
function AuthorKeyRef({ value, onChange, path, label, help }) {
  const t = useT();
  const { authorKeys } = useForm();
  const list = authorKeys ?? [];
  return (
    <Labeled label={label} help={help} path={path}>
      <select value={value ?? ''} aria-label={label ? t(label) : label} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">{t('— tutti —')}</option>
        {list.map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}
        {value && !list.some((a) => a.key === value) && <option value={value}>{value} {t('(non esiste)')}</option>}
      </select>
    </Labeled>
  );
}

// Un tag da una lista (per esempio per filtrare un elenco di articoli).
function TagRef({ value, onChange, path, label, help }) {
  const t = useT();
  const { tags } = useForm();
  const list = tags ?? [];
  return (
    <Labeled label={label} help={help} path={path}>
      <select value={value ?? ''} aria-label={label ? t(label) : label} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">{t('— tutti —')}</option>
        {list.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}
        {value && !list.some((x) => x.key === value) && <option value={value}>{value} {t('(non esiste)')}</option>}
      </select>
    </Labeled>
  );
}

// Una categoria da una lista (per esempio per filtrare un elenco di articoli).
function CategoryRef({ value, onChange, path, label, help }) {
  const t = useT();
  const { categories } = useForm();
  const list = categories ?? [];
  return (
    <Labeled label={label} help={help} path={path}>
      <select value={value ?? ''} aria-label={label ? t(label) : label} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">{t('— tutte —')}</option>
        {list.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
        {value && !list.some((c) => c.key === value) && <option value={value}>{value} {t('(non esiste)')}</option>}
      </select>
    </Labeled>
  );
}

// Scelta dell'header o del footer di una pagina: vuoto = quello predefinito, «Nessuno» = la pagina non ne ha.
function LayoutRef({ value, onChange, path, label, help, widget }) {
  const t = useT();
  const { headerKeys, footerKeys } = useForm();
  const keys = (widget === 'layout-header' ? headerKeys : footerKeys) ?? [];
  const what = widget === 'layout-header' ? 'header' : 'footer';
  return (
    <Labeled label={label} help={help} path={path}>
      <select value={value ?? ''} aria-label={label ? t(label) : label} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">{t('— predefinito —')}</option>
        {keys.map((k) => <option key={k} value={k}>{k}</option>)}
        <option value="none">{t('Nessuno')}</option>
        {value && value !== 'none' && !keys.includes(value) && <option value={value}>{value} {t('(non esiste)')}</option>}
      </select>
      {keys.length === 0 && <p className="fld__help">{what === 'header' ? t('Nessun header creato: si fanno da Admin → Header. Intanto la pagina usa quello dei dati del sito.') : t('Nessun footer creato: si fanno da Admin → Footer. Intanto la pagina usa quello dei dati del sito.')}</p>}
    </Labeled>
  );
}

// Elenco di header (o footer) con un nome ciascuno: si apre per modificare, si duplica, si elimina, se ne aggiunge uno nuovo.
function LayoutMap({ schema, value, onChange, path, ancestors }) {
  const t = useT();
  const { s } = model.kindOf(schema);
  const { issues, defaultLocale } = useForm();
  const obj = value ?? {};
  const item = s['x-item'];
  const named = !!s.additionalProperties?.properties?.name;   // categorie e tag: un nome e una descrizione, la chiave si ricava dal nome
  const keyRe = new RegExp(s.propertyNames?.pattern ?? '^[a-z][a-z0-9-]*$');
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [open, setOpen] = useState({});
  const newKey = named ? keyOf(name) : name;
  const valid = keyRe.test(newKey) && !(newKey in obj);
  const dup = (k) => { let n = `${k}-copia`; for (let i = 2; n in obj; i++) n = `${k}-copia-${i}`; onChange({ ...obj, [n]: JSON.parse(JSON.stringify(obj[k])) }); setOpen({ ...open, [n]: true }); };
  return (
    <div className="map">
      <ol className="items">
        {Object.entries(obj).map(([k, b]) => {
          const p = `${path}/${k}`;
          const errs = issuesUnder(issues, p).filter((x) => x.severity === 'error').length;
          return (
            <li key={k} className={`item ${open[k] ? 'is-open' : ''}`} data-path={p}>
              <div className="item__head">
                <button type="button" className="item__toggle" aria-expanded={!!open[k]} onClick={() => setOpen({ ...open, [k]: !open[k] })}>
                  <span className="item__caret">{open[k] ? '▾' : '▸'}</span><span className="item__type">{named ? (b?.name?.[defaultLocale] ?? k) : k}</span>{named ? <span className="item__sum">{k}</span> : k === 'default' && <span className="item__sum">{t('predefinito')}</span>}
                  {errs > 0 && <span className="badge bad">{errs}</span>}
                </button>
                <div className="ctl">
                  <button type="button" className="ico" aria-label={t('Duplica')} title={t('Duplica')} onClick={() => dup(k)}>⧉</button>
                  <button type="button" className="ico" aria-label={t('Elimina')} onClick={() => { if (!window.confirm(named ? t(item === 'tag' ? 'Eliminare «{name}»? Gli articoli che lo usano lo perderanno.' : 'Eliminare «{name}»? Gli articoli che la usano la perderanno.', { name: b?.name?.[defaultLocale] ?? k }) : t('Eliminare «{name}»? Le pagine che lo usano dovranno sceglierne un altro.', { name: k }))) return; const n = { ...obj }; delete n[k]; onChange(n); }}>✕</button>
                </div>
              </div>
              {open[k] && <div className="item__body"><ObjectField schema={s.additionalProperties} value={b} onChange={(v) => onChange({ ...obj, [k]: v })} path={p} ancestors={[...ancestors, obj]} /></div>}
            </li>
          );
        })}
      </ol>
      {named ? (
        <div className="mapadd mapadd--named">
          <label>{t('Nome')}<input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-label={item === 'tag' ? t('Nome del nuovo tag') : t('Nome della nuova {item}', { item: t(item) })} /></label>
          <label>{t('Descrizione (facoltativa)')}<textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} aria-label={t('Descrizione')} /></label>
          <button type="button" className="btn" disabled={!valid}
            onClick={() => { onChange({ ...obj, [newKey]: { name: { [defaultLocale]: name.trim() }, ...(desc.trim() ? { description: { [defaultLocale]: desc.trim() } } : {}) } }); setName(''); setDesc(''); }}>{t('+ Aggiungi {item}', { item: t(item) })}</button>
          {name.trim() && !valid && <p className="fld__help">{newKey in obj ? t("Esiste già: l'indirizzo «{k}» è già usato.", { k: newKey }) : t('Il nome deve contenere almeno una lettera o un numero.')}</p>}
          {valid && <p className="fld__help">{t('Indirizzo della pagina:')} <code>{newKey}</code></p>}
        </div>
      ) : (
        <div className="mapadd">
          <input placeholder={t('nome (es. default, landing, minimale)')} aria-label={t('Nome del nuovo elemento')} value={name} onChange={(e) => setName(e.target.value.toLowerCase())} />
          <button type="button" className="btn" disabled={!valid} onClick={() => { onChange({ ...obj, [name]: model.defaultValue(s.additionalProperties, () => name) }); setOpen({ ...open, [name]: true }); setName(''); }}>{item ? t('+ Aggiungi {item}', { item: t(item) }) : t('Aggiungi')}</button>
        </div>
      )}
      {!named && name && !valid && <p className="fld__help">{t('Il nome usa lettere minuscole, numeri e trattini, e non deve esistere già.')}</p>}
    </div>
  );
}

// ---- oggetti -----------------------------------------------------------------------------------------------------------------

function ObjectField({ schema, value, onChange, path, ancestors, pick, omit = [], hideKeys = [], bare }) {
  const t = useT();
  const { s } = model.kindOf(schema);
  const obj = value ?? {};
  const required = new Set(s.required ?? []);
  const anc = [...ancestors, obj];
  const set = (k, v) => { const next = { ...obj }; if (v === undefined) delete next[k]; else next[k] = v; onChange(next); };
  const { idFor, locales, defaultLocale, activeLang } = useForm();
  const lang = useLang();
  const isSharedVariant = s.title === 'Blocco condiviso';
  // Gli indirizzi (slug) si chiedono solo per le lingue attive: con una lingua sola, un campo solo.
  // Con le schede di lingua (activeLang) solo l'indirizzo della lingua aperta; l'etichetta porta il nome di quella lingua, nella lingua dell'admin.
  const isSlug = path.endsWith('/slug');
  const onlyLocales = isSlug && locales?.length ? (activeLang ? [activeLang] : [...new Set([defaultLocale, ...locales])]) : null;

  const fields = Object.keys(s.properties)
    .filter((k) => (!pick || pick.includes(k)) && !omit.includes(k) && !hideKeys.includes(k) && (!onlyLocales || onlyLocales.includes(k)))
    .map((k) => {
      const ps = s.properties[k];
      const { kind, s: ds } = model.kindOf(ps);
      if (kind === 'hidden' || kind === 'const' || !isVisible(ps, anc)) return null;
      if (kind === 'enum' && ds.enum.length === 1) return null;
      const opt = isSlug && onlyLocales ? false : !required.has(k);   // gli indirizzi mostrati sono tutti obbligatori
      const label = isSlug ? `${t('Indirizzo')} · ${langName(k, lang)}` : ds.title ?? keyLabel(k) ?? humanizeKey(k);
      const p = `${path}/${k}`;
      if (isSharedVariant && k === 'ref') return <SharedRef key={k} value={obj[k]} onChange={(v) => set(k, v)} path={p} />;
      if (opt && ['object', 'image', 'link', 'union'].includes(kind) && obj[k] === undefined) {
        return <button key={k} type="button" className="add" onClick={() => set(k, model.defaultValue(ps, () => idFor('x')))}>+ {t(label)}</button>;
      }
      return (
        <Field key={k} schema={ps} value={obj[k]} onChange={(v) => set(k, v)} path={p} ancestors={anc} optional={opt} label={label} help={ds.description}
          onRemove={opt && ['object', 'image', 'link', 'union'].includes(kind) ? () => set(k, undefined) : undefined} />
      );
    });
  if (bare) return <>{fields}</>;
  return <div className="obj">{fields}</div>;
}

function UnionField({ schema, value, onChange, path, ancestors, label, help, onRemove }) {
  const t = useT();
  const { idFor } = useForm();
  const variants = model.variantsOf(schema);
  const cur = model.variantFor(schema, value) ?? variants[0];
  return (
    <Labeled label={label} help={help} path={path} onRemove={onRemove}>
      <select value={cur.value} aria-label={t('{label}: tipo', { label: label ? t(label) : '' })} onChange={(e) => { const v = variants.find((x) => x.value === e.target.value); onChange(model.defaultValue(v.schema, () => idFor(v.value))); }}>
        {variants.map((v) => <option key={v.value} value={v.value}>{t(labelFor(v.value))}</option>)}
      </select>
      <div className="sub"><ObjectField schema={cur.schema} value={value} onChange={onChange} path={path} ancestors={ancestors} /></div>
    </Labeled>
  );
}

// ---- elenchi ---------------------------------------------------------------------------------------------------------------------

function AddMenu({ label, variants, onPick, disabled }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="menu">
      <button type="button" className="add" disabled={disabled} aria-expanded={open} onClick={() => setOpen(!open)}>+ {t(label)}</button>
      {open && (
        <ul className="menu__list" role="menu">
          {variants.map((v) => (
            <li key={v.value}>
              <button type="button" role="menuitem" onClick={() => { setOpen(false); onPick(v); }}>
                <strong>{t(v.title ?? 'Blocco condiviso')}</strong>
                {uiOf().blockHints[v.value] && <span>{t(uiOf().blockHints[v.value])}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Tipi di elemento che il form mostra in una riga sola; gli altri (oggetti, unioni) hanno una scheda apribile.
export const COMPACT_ITEMS = ['i18n', 'string', 'enum', 'number', 'boolean'];

function ArrayField({ schema, value, onChange, path, ancestors, optional, label, help }) {
  const t = useT();
  const lang = useLang();
  const { s } = model.kindOf(schema);
  const { issues, idFor, getRoot } = useForm();
  const items = Array.isArray(value) ? value : [];
  const itemKind = model.kindOf(s.items).kind;
  const compact = COMPACT_ITEMS.includes(itemKind);   // elementi semplici: una riga ciascuno, senza scheda
  const isUnion = itemKind === 'union';
  // I blocchi di una pagina partono chiusi; gli elenchi corti dentro un blocco partono aperti (una FAQ appena creata si scrive subito).
  const [open, setOpen] = useState(() => items.map(() => !isUnion && !compact && items.length <= 3));
  const isOpen = (i) => open[i] ?? false;
  const min = s.minItems ?? 0;
  const max = s.maxItems ?? Infinity;
  // «Aggiungi <definizione>»: la dice lo schema (x-item), altrimenti il titolo del tipo di elemento.
  const itemTitle = !isUnion ? model.deref(s.items).s.title : null;
  const lcFirst = (x) => (lang === 'en' && /^[A-Z]{2}/.test(x) ? x : x.charAt(0).toLowerCase() + x.slice(1));
  const sing = singular(label ?? s.title);
  const addLabel = s['x-item'] ? t(s['x-item']) : itemTitle ? lcFirst(t(itemTitle)) : sing ? t(sing) : t(compact ? 'voce' : 'elemento');

  const commit = (next, nextOpen) => { setOpen(nextOpen ?? next.map((_, i) => open[i] ?? false)); onChange(next.length === 0 && optional ? undefined : next); };
  const move = (i, d) => { const j = i + d; if (j < 0 || j >= items.length) return; const n = [...items]; [n[i], n[j]] = [n[j], n[i]]; const o = items.map((_, k) => isOpen(k)); [o[i], o[j]] = [o[j], o[i]]; commit(n, o); };
  const remove = (i) => commit(items.filter((_, k) => k !== i), items.map((_, k) => isOpen(k)).filter((_, k) => k !== i));
  const duplicate = (i) => { const c = cloneWithNewIds(items[i], collectIds(getRoot())); const n = [...items]; n.splice(i + 1, 0, c); const o = items.map((_, k) => isOpen(k)); o.splice(i + 1, 0, true); commit(n, o); };
  const add = (variant) => {
    const type = variant?.value ?? 'item';
    const item = model.defaultValue(variant ? variant.schema : s.items, () => idFor(type));
    commit([...items, item], [...items.map((_, k) => isOpen(k)), true]);
  };
  const setItem = (i, v) => { const n = [...items]; n[i] = v; onChange(n); };
  const toggleVisible = (i) => { const it = { ...items[i] }; if (it.visible === false) delete it.visible; else it.visible = false; setItem(i, it); };

  return (
    <Labeled label={label} help={help} path={path} className="list">
      {items.length === 0 && <p className="fld__help">{isUnion ? t('Nessun blocco. Aggiungine uno.') : t('Nessun elemento.')}</p>}
      <ol className="items">
        {items.map((item, i) => {
          const p = `${path}/${i}`;
          const variant = isUnion ? model.variantFor(s.items, item) : null;
          const objSchema = variant ? variant.schema : s.items;
          const under = issuesUnder(issues, p);
          const hidden = item?.visible === false;
          const canHide = variant && model.kindOf(variant.schema).s.properties?.visible;
          const errCount = under.filter((x) => x.severity === 'error').length;
          if (compact) {
            return (
              <li key={i} className="row-item">
                <div className="row-item__field"><Field schema={s.items} value={item} onChange={(v) => setItem(i, v ?? (itemKind === 'i18n' ? { it: '' } : ''))} path={p} ancestors={[...ancestors, items]} optional={false} /></div>
                <div className="ctl">
                  <button type="button" className="ico" aria-label={t('Sposta su')} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                  <button type="button" className="ico" aria-label={t('Sposta giù')} disabled={i === items.length - 1} onClick={() => move(i, 1)}>↓</button>
                  <button type="button" className="ico" aria-label={t('Elimina')} disabled={items.length <= min} onClick={() => remove(i)}>✕</button>
                </div>
              </li>
            );
          }
          return (
            <li key={item?.id ?? i} className={`item ${isOpen(i) ? 'is-open' : ''} ${hidden ? 'is-hidden' : ''}`} data-path={p}>
              <div className="item__head">
                <button type="button" className="item__toggle" aria-expanded={isOpen(i)} onClick={() => setOpen(items.map((_, k) => (k === i ? !isOpen(i) : isOpen(k))))}>
                  <span className="item__caret">{isOpen(i) ? '▾' : '▸'}</span>
                  <span className="item__type">{variant ? t(variant.title ?? 'Blocco condiviso') : `${t(label ?? 'Elemento')} ${i + 1}`}</span>
                  <span className="item__sum">{t(summarize(item) || (variant?.value === 'shared' ? item.ref : ''))}</span>
                  {hidden && <span className="badge">{t('nascosto')}</span>}
                  {errCount > 0 && <span className="badge bad" title={t('{n} da sistemare', { n: errCount })}>{errCount}</span>}
                  {errCount === 0 && under.length > 0 && <span className="badge warn">{t('avviso')}</span>}
                </button>
                <div className="ctl">
                  {canHide && <button type="button" className="ico" aria-label={hidden ? t('Mostra') : t('Nascondi')} title={hidden ? t('Mostra nel sito') : t('Nascondi dal sito')} onClick={() => toggleVisible(i)}>{hidden ? '◌' : '◉'}</button>}
                  <button type="button" className="ico" aria-label={t('Sposta su')} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                  <button type="button" className="ico" aria-label={t('Sposta giù')} disabled={i === items.length - 1} onClick={() => move(i, 1)}>↓</button>
                  <button type="button" className="ico" aria-label={t('Duplica')} disabled={items.length >= max} onClick={() => duplicate(i)}>⧉</button>
                  <button type="button" className="ico" aria-label={t('Elimina')} disabled={items.length <= min} onClick={() => remove(i)}>✕</button>
                </div>
              </div>
              {isOpen(i) && (
                <div className="item__body">
                  {isUnion && !variant
                    ? <p className="fld__issues"><span className="bad">{t('Tipo di blocco sconosciuto: {type}', { type: String(item?.type) })}</span></p>
                    : <ObjectField schema={objSchema} value={item} onChange={(v) => setItem(i, v)} path={p} ancestors={[...ancestors, items]} hideKeys={['visible']} />}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {isUnion
        ? <AddMenu label="Aggiungi blocco" variants={model.variantsOf(s.items)} onPick={add} disabled={items.length >= max} />
        : <button type="button" className="add" disabled={items.length >= max} onClick={() => add(null)}>{t('+ Aggiungi {x}', { x: addLabel })}</button>}
    </Labeled>
  );
}

// Mappa chiave → blocco (blocchi condivisi).
function MapField({ schema, value, onChange, path, ancestors }) {
  const t = useT();
  const { s } = model.kindOf(schema);
  if (!s.additionalProperties?.oneOf) return <LayoutMap schema={schema} value={value} onChange={onChange} path={path} ancestors={ancestors} />;   // header e footer: oggetti semplici, non blocchi
  const { idFor, issues } = useForm();
  const obj = value ?? {};
  const [name, setName] = useState('');
  const [open, setOpen] = useState({});
  const valid = /^[a-z][a-z0-9-]*$/.test(name) && !(name in obj);
  const variants = model.variantsOf(s.additionalProperties);
  return (
    <div className="map">
      <ol className="items">
        {Object.entries(obj).map(([k, b]) => {
          const p = `${path}/${k}`;
          const variant = model.variantFor(s.additionalProperties, b);
          const errs = issuesUnder(issues, p).filter((x) => x.severity === 'error').length;
          return (
            <li key={k} className={`item ${open[k] ? 'is-open' : ''}`} data-path={p}>
              <div className="item__head">
                <button type="button" className="item__toggle" aria-expanded={!!open[k]} onClick={() => setOpen({ ...open, [k]: !open[k] })}>
                  <span className="item__caret">{open[k] ? '▾' : '▸'}</span><span className="item__type">{k}</span><span className="item__sum">{variant?.title ? t(variant.title) : variant?.title}</span>
                  {errs > 0 && <span className="badge bad">{errs}</span>}
                </button>
                <div className="ctl"><button type="button" className="ico" aria-label={t('Elimina')} onClick={() => { const n = { ...obj }; delete n[k]; onChange(n); }}>✕</button></div>
              </div>
              {open[k] && variant && <div className="item__body"><ObjectField schema={variant.schema} value={b} onChange={(v) => onChange({ ...obj, [k]: { ...v, id: k } })} path={p} ancestors={[...ancestors, obj]} hideKeys={['visible', 'id']} /></div>}
            </li>
          );
        })}
      </ol>
      <div className="mapadd">
        <input placeholder={t('nome del blocco (es. nastro-servizi)')} aria-label={t('Nome del nuovo blocco condiviso')} value={name} onChange={(e) => setName(e.target.value.toLowerCase())} />
        <AddMenu label="Aggiungi blocco condiviso" variants={variants.filter((v) => v.value !== 'shared')} disabled={!valid} onPick={(v) => { const b = model.defaultValue(v.schema, () => name); onChange({ ...obj, [name]: { ...b, id: name } }); setOpen({ ...open, [name]: true }); setName(''); }} />
      </div>
      {name && !valid && <p className="fld__help">{t('Il nome usa lettere minuscole, numeri e trattini, e non deve esistere già.')}</p>}
    </div>
  );
}

// ---- dispatcher -----------------------------------------------------------------------------------------------------------------

export function Field({ schema, value, onChange, path, ancestors = [], optional, label, help, pick, omit, hideKeys, onRemove, bare }) {
  const t = useT();
  const { issues } = useForm();
  const { kind, s, widget } = model.kindOf(schema);
  const title = label ?? s.title;
  const helpText = help ?? s.description;
  switch (kind) {
    case 'hidden': case 'const': return null;
    case 'i18n': return <I18nField schema={schema} value={value} onChange={onChange} path={path} optional={optional} label={title} help={helpText} widget={widget} onRemove={onRemove} />;
    case 'image': return <ImageField schema={schema} value={value} onChange={onChange} path={path} label={title} help={helpText} onRemove={onRemove} />;
    case 'mediaPath': return <MediaPathField value={value} onChange={onChange} path={path} label={title} help={helpText} optional={optional} />;
    case 'code': return <CodeField value={value} onChange={onChange} path={path} label={title} help={helpText} optional={optional} />;
    case 'link': return <LinkField value={value} onChange={onChange} path={path} label={title} help={helpText} onRemove={onRemove} />;
    case 'pageKey': return <PageSelect value={value} onChange={onChange} path={path} label={title} help={helpText} optional={optional} />;
    case 'pageKeyNullable': return <PageSelect value={value} onChange={onChange} path={path} label={title} help={helpText} nullable optional />;
    case 'enum': return <EnumField s={s} value={value} onChange={onChange} path={path} optional={optional} label={title} help={helpText} />;
    case 'boolean': return (
      <Labeled path={path} help={helpText}>
        <label className="check"><input type="checkbox" checked={value ?? s.default ?? false} onChange={(e) => onChange(e.target.checked)} /> {title ? t(title) : title}</label>
      </Labeled>
    );
    case 'number': return <Labeled label={title} help={helpText} path={path} required={!optional}><NumInput value={value} label={title} min={s.minimum} max={s.maximum} onChange={onChange} /></Labeled>;
    case 'string': return (
      <Labeled label={title} help={helpText} path={path} required={!optional}>
        <input type={s.format === 'date' ? 'date' : s['x-widget'] === 'datetime' ? 'datetime-local' : undefined} step={s['x-widget'] === 'datetime' ? 3600 : undefined} value={value ?? ''} aria-label={title ? t(title) : title} onChange={(e) => onChange(e.target.value === '' && optional ? undefined : e.target.value)} />
      </Labeled>
    );
    case 'union': return <UnionField schema={schema} value={value} onChange={onChange} path={path} ancestors={ancestors} label={title} help={helpText} onRemove={onRemove} />;
    case 'array': return <ArrayField schema={schema} value={value} onChange={onChange} path={path} ancestors={ancestors} optional={optional} label={title} help={helpText} />;
    case 'categoryRef': return <CategoryRef value={value} onChange={onChange} path={path} label={title} help={helpText} />;
    case 'tagPicker': return <TagPicker value={value} onChange={onChange} path={path} label={title} help={helpText} />;
    case 'authorKeyRef': return <AuthorKeyRef value={value} onChange={onChange} path={path} label={title} help={helpText} />;
    case 'authorRef': return <AuthorRef value={value} onChange={onChange} path={path} label={title} help={helpText} optional={optional} />;
    case 'tagRef': return <TagRef value={value} onChange={onChange} path={path} label={title} help={helpText} />;
    case 'categoryPicker': return <CategoryPicker value={value} onChange={onChange} path={path} label={title} help={helpText} />;
    case 'layoutRef': return <LayoutRef value={value} onChange={onChange} path={path} label={title} help={helpText} widget={widget} />;
    case 'map': return <MapField schema={schema} value={value} onChange={onChange} path={path} ancestors={ancestors} />;
    case 'object': {
      if (bare) return <ObjectField schema={schema} value={value} onChange={onChange} path={path} ancestors={ancestors} pick={pick} omit={omit} hideKeys={hideKeys} bare />;
      return (
        <fieldset className="grp" data-path={path}>
          {(title || onRemove) && (
            <legend>{title ? t(title) : title}{onRemove && <button type="button" className="mini" onClick={onRemove}>{t('Rimuovi')}</button>}</legend>
          )}
          {helpText && <p className="fld__help">{t(helpText)}</p>}
          <ObjectField schema={schema} value={value} onChange={onChange} path={path} ancestors={ancestors} pick={pick} omit={omit} hideKeys={hideKeys} />
          <Issues list={issuesAt(issues, path)} />
        </fieldset>
      );
    }
    default: return null;
  }
}
