'use client';

// Form generato dagli schemi (schema/): ogni nodo dello schema diventa un campo. Nessun campo è scritto a mano per un blocco specifico.
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { INLINE, BLOCK } from '@/schema/common.mjs';
import MediaPicker from './MediaPicker';
import { sanitizeRich } from '@/render/sanitize.mjs';   // il testo si mostra solo dopo la sanificazione (mai HTML del dato così com'è)
import { isVisible, summarize, newId, collectIds, labelFor, humanizeKey, keyLabel, uiOf } from '@/lib/schema-form.mjs';

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
  if (!list.length) return null;
  return (
    <ul className="fld__issues" role="alert">
      {list.map((i, k) => <li key={k} className={i.severity === 'warning' ? 'warn' : SOFT.has(i.message) ? 'soft' : 'bad'}>{i.message}</li>)}
    </ul>
  );
}

function Labeled({ label, help, path, deep, required, onRemove, children, className = '' }) {
  const { issues } = useForm();
  const here = deep ? issuesUnder(issues, path) : issuesAt(issues, path);
  return (
    <div className={`fld ${className}`} data-path={path}>
      {(label || onRemove) && (
        <div className="fld__head">
          <span className="fld__label">{label}{required && <abbr title="Obbligatorio"> *</abbr>}</span>
          {onRemove && <button type="button" className="mini" onClick={onRemove}>Rimuovi</button>}
        </div>
      )}
      {help && <p className="fld__help">{help}</p>}
      {children}
      <Issues list={here} />
    </div>
  );
}

// Numero con testo libero (si può scrivere "4." senza che il campo si azzeri).
function NumInput({ value, onChange, min, max, label }) {
  const [text, setText] = useState(value == null ? '' : String(value));
  const last = useRef(value);
  useEffect(() => { if (value !== last.current) { setText(value == null ? '' : String(value)); last.current = value; } }, [value]);
  return (
    <input className="num" type="text" inputMode="decimal" aria-label={label} value={text}
      onChange={(e) => {
        const v = e.target.value; setText(v);
        const n = v.trim() === '' ? undefined : Number(v.replace(',', '.'));
        if (n === undefined || Number.isFinite(n)) { last.current = n; onChange(n); }
      }}
      title={min != null || max != null ? `Da ${min ?? '−∞'} a ${max ?? '+∞'}` : undefined}
    />
  );
}

// ---- testi con formattazione -------------------------------------------------------------------------------

function RichEditor({ value, onChange, mode, label }) {
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
      <div className="rich__bar" role="toolbar" aria-label={`Formattazione: ${label ?? ''}`}>
        <button type="button" onClick={() => wrap('<strong>', '</strong>')} title="Grassetto"><b>G</b></button>
        <button type="button" onClick={() => wrap('<em>', '</em>')} title="Corsivo"><i>C</i></button>
        <button type="button" onClick={() => setLink(link ? null : { type: 'page', page: pages[0]?.key ?? 'home', url: 'https://' })} title="Link" aria-expanded={!!link}>Link</button>
        <button type="button" onClick={() => edit((v, a, b) => [v.slice(0, a) + '<br>' + v.slice(b), a + 4, a + 4])} title="A capo">↵</button>
        {block && (
          <>
            <span className="rich__sep" />
            <button type="button" onClick={() => wrap('<p>', '</p>')} title="Paragrafo">¶</button>
            <select aria-label="Titolo" value="" onChange={(e) => { if (e.target.value) wrap(`<${e.target.value}>`, `</${e.target.value}>`); }}>
              <option value="">Titolo…</option>
              {['h2', 'h3', 'h4', 'h5', 'h6'].map((h) => <option key={h} value={h}>{h.toUpperCase()}</option>)}
            </select>
            <button type="button" onClick={() => list('ul')} title="Elenco puntato">• Elenco</button>
            <button type="button" onClick={() => list('ol')} title="Elenco numerato">1. Elenco</button>
            <button type="button" onClick={() => wrap('<blockquote>', '</blockquote>')} title="Citazione">“ ”</button>
          </>
        )}
      </div>
      {link && (
        <div className="rich__link">
          <select aria-label="Tipo di link" value={link.type} onChange={(e) => setLink({ ...link, type: e.target.value })}>
            <option value="page">Pagina del sito</option><option value="url">Indirizzo esterno</option><option value="channel">Contatto</option>
          </select>
          {link.type === 'page' && <select aria-label="Pagina" value={link.page} onChange={(e) => setLink({ ...link, page: e.target.value })}>{pages.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}</select>}
          {link.type === 'url' && <input aria-label="Indirizzo" value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value })} />}
          {link.type === 'channel' && <select aria-label="Contatto" value={link.channel ?? 'phone'} onChange={(e) => setLink({ ...link, channel: e.target.value })}>{['phone', 'mobile', 'whatsapp', 'email'].map((c) => <option key={c} value={c}>{labelFor(c)}</option>)}</select>}
          <button type="button" className="mini mini--primary" onClick={insertLink}>Inserisci</button>
          <span className="fld__help">sul testo selezionato</span>
        </div>
      )}
      <textarea ref={ref} rows={block ? 8 : 3} value={value ?? ''} aria-label={label} spellCheck onChange={(e) => onChange(e.target.value)} />
      {!ok && <p className="fld__issues"><span className="bad">Contiene formattazione non ammessa: usa solo i pulsanti sopra.</span></p>}
      {ok && /</.test(value ?? '') && (
        <div className="rich__preview" aria-label="Anteprima del testo" onClick={(e) => e.preventDefault()}
          dangerouslySetInnerHTML={{ __html: sanitizeRich(value ?? '').replace(/href="[^"]*"/g, 'href="#"') }} />
      )}
    </div>
  );
}

// ---- testo per lingua -------------------------------------------------------------------------------------------

function I18nField({ schema, value, onChange, path, optional, label, help, widget, onRemove }) {
  const { locales, defaultLocale } = useForm();
  const v = value ?? {};
  const shown = [...new Set([defaultLocale, ...locales])];
  const set = (loc, text) => {
    const next = { ...v, [loc]: text };
    for (const l of Object.keys(next)) if (l !== defaultLocale && next[l] === '') delete next[l];
    if (optional && !Object.values(next).some((x) => x !== '')) onChange(undefined); else onChange(next);
  };
  const spec = model.deref(schema).s.properties?.[defaultLocale] ?? {};
  const max = spec.maxLength;
  return (
    <Labeled label={label} help={help} path={path} deep required={!optional} onRemove={onRemove}>
      {shown.map((loc) => (
        <div key={loc} className="loc">
          {shown.length > 1 && <span className="loc__tag">{loc.toUpperCase()}</span>}
          {widget === 'rich-inline' || widget === 'rich-block'
            ? <RichEditor value={v[loc]} onChange={(t) => set(loc, t)} mode={widget} label={`${label ?? ''} ${loc}`} />
            : widget === 'textarea'
              ? <textarea rows={3} value={v[loc] ?? ''} aria-label={`${label ?? ''} ${loc}`} onChange={(e) => set(loc, e.target.value)} />
              : <input value={v[loc] ?? ''} aria-label={`${label ?? ''} ${loc}`} maxLength={max} onChange={(e) => set(loc, e.target.value)} />}
        </div>
      ))}
    </Labeled>
  );
}

// ---- immagine con punto focale ---------------------------------------------------------------------------------------

function FocalPicker({ src, focal, onPick }) {
  const pick = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    onPick({ x: Math.round(((e.clientX - r.left) / r.width) * 100), y: Math.round(((e.clientY - r.top) / r.height) * 100) });
  };
  return (
    <div className="focal" onClick={onPick ? pick : undefined} title={onPick ? 'Clicca per scegliere il punto che deve restare al centro' : undefined}>
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
  const { media } = useForm();
  const s = model.deref(schema).s;
  const v = value ?? { src: '', alt: { it: '' } };
  const set = (part) => { const next = { ...v, ...part }; for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k]; onChange(next); };
  const info = media.find((i) => i.path === v.src);
  // Con una nuova immagine, il testo alternativo predefinito della libreria si propone solo se il campo è ancora vuoto.
  const choose = (item) => set({ src: item.path, ...(!v.alt?.it && item.alt ? { alt: { ...v.alt, it: item.alt } } : {}) });
  return (
    <Labeled label={label} help={help} path={path} onRemove={onRemove} className="imgfield">
      <div className="imgfield__grid">
        <div>
          {v.src ? <FocalPicker src={v.src} focal={v.focal} onPick={(f) => set({ focal: f })} /> : <div className="focal focal--empty">Nessuna immagine</div>}
          {v.src && <p className="fld__help">Clicca sull&apos;immagine per il punto focale{v.focal ? ` (${v.focal.x}%, ${v.focal.y}%)` : ''}.</p>}
        </div>
        <div className="imgfield__fields">
          <Labeled label="File" path={`${path}/src`} required>
            <div className="imgfield__file">
              <PickButton current={v.src} label={`${label ?? 'Immagine'}: ${v.src ? 'cambia' : 'scegli'} immagine`} onPick={choose}>{v.src ? 'Cambia immagine' : 'Scegli immagine'}</PickButton>
              {v.src && <span className="imgfield__name" title={v.src}>{info?.name ?? v.src}{info?.missing ? ' (file mancante)' : ''}</span>}
            </div>
          </Labeled>
          <I18nField schema={s.properties.alt} value={v.alt} onChange={(a) => set({ alt: a ?? { it: '' } })} path={`${path}/alt`} label="Testo alternativo" help={s.properties.alt.description} widget="text" />
          <div className="imgfield__focal">
            <button type="button" className="mini" onClick={() => set({ focal: v.focal ? undefined : { x: 50, y: 50 } })}>{v.focal ? 'Togli punto focale' : 'Imposta punto focale'}</button>
            {v.focal && <button type="button" className="mini" onClick={() => set({ focalMobile: v.focalMobile ? undefined : { ...v.focal } })}>{v.focalMobile ? 'Stesso su mobile' : 'Diverso su mobile'}</button>}
          </div>
          {v.focalMobile && <p className="fld__help">Su mobile: {v.focalMobile.x}%, {v.focalMobile.y}%. <button type="button" className="mini" onClick={() => set({ focalMobile: { x: v.focal.x, y: v.focal.y } })}>Copia dal desktop</button></p>}
        </div>
      </div>
    </Labeled>
  );
}

// Campo testuale che contiene il percorso di un'immagine della libreria (dati del sito: logo, favicon...).
function MediaPathField({ value, onChange, path, label, help, optional }) {
  const { media } = useForm();
  const info = media.find((i) => i.path === value);
  return (
    <Labeled label={label} help={help} path={path} required={!optional}>
      <div className="imgfield__file">
        {value && <span className="mthumb">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={`/admin/media/thumb/${value}`} alt="" /></span>}
        <PickButton current={value} label={`${label}: ${value ? 'cambia' : 'scegli'} immagine`} onPick={(item) => onChange(item.path)}>{value ? 'Cambia immagine' : 'Scegli immagine'}</PickButton>
        {value && <span className="imgfield__name" title={value}>{info?.name ?? value}{info?.missing ? ' (file mancante)' : ''}</span>}
        {value && optional && <button type="button" className="mini" onClick={() => onChange(undefined)}>Togli</button>}
      </div>
    </Labeled>
  );
}

// ---- link -----------------------------------------------------------------------------------------------------------------

function LinkField({ value, onChange, path, label, help, onRemove }) {
  const { pages } = useForm();
  const v = value ?? { type: 'page', page: pages[0]?.key ?? 'home' };
  const change = (type) => onChange({ page: { type: 'page', page: pages[0]?.key ?? 'home' }, url: { type: 'url', url: '' }, anchor: { type: 'anchor', anchor: '' }, channel: { type: 'channel', channel: 'phone' } }[type]);
  return (
    <Labeled label={label} help={help} path={path} deep onRemove={onRemove}>
      <div className="linkfield">
        <select value={v.type} aria-label={`${label ?? 'Link'}: tipo`} onChange={(e) => change(e.target.value)}>
          {['page', 'url', 'anchor', 'channel'].map((t) => <option key={t} value={t}>{labelFor(t)}</option>)}
        </select>
        {v.type === 'page' && (
          <>
            <select value={v.page} aria-label={`${label ?? 'Link'}: pagina`} onChange={(e) => onChange({ ...v, page: e.target.value })}>
              {!pages.some((p) => p.key === v.page) && <option value={v.page}>{v.page} (non esiste)</option>}
              {pages.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
            </select>
            <input placeholder="ancora (facoltativa)" aria-label={`${label ?? 'Link'}: ancora`} value={v.anchor ?? ''} onChange={(e) => { const { anchor, ...rest } = v; onChange(e.target.value ? { ...rest, anchor: e.target.value } : rest); }} />
          </>
        )}
        {v.type === 'url' && <input placeholder="https://…" aria-label={`${label ?? 'Link'}: indirizzo`} value={v.url} onChange={(e) => onChange({ ...v, url: e.target.value })} />}
        {v.type === 'anchor' && <input placeholder="nome-ancora" aria-label={`${label ?? 'Link'}: ancora`} value={v.anchor} onChange={(e) => onChange({ ...v, anchor: e.target.value })} />}
        {v.type === 'channel' && (
          <select value={v.channel} aria-label={`${label ?? 'Link'}: contatto`} onChange={(e) => onChange({ ...v, channel: e.target.value })}>
            {['phone', 'mobile', 'whatsapp', 'email'].map((c) => <option key={c} value={c}>{labelFor(c)}</option>)}
          </select>
        )}
      </div>
    </Labeled>
  );
}

// ---- campi semplici --------------------------------------------------------------------------------------------------------

function EnumField({ s, value, onChange, path, optional, label, help }) {
  const shown = value ?? s.default ?? '';
  return (
    <Labeled label={label} help={help} path={path} required={!optional}>
      <select value={String(shown)} aria-label={label} onChange={(e) => { const raw = e.target.value; onChange(raw === '' ? undefined : s.enum.find((x) => String(x) === raw)); }}>
        {optional && s.default === undefined && <option value="">—</option>}
        {s.enum.map((x) => <option key={String(x)} value={String(x)}>{labelFor(x)}</option>)}
      </select>
    </Labeled>
  );
}

function PageSelect({ value, onChange, path, label, help, nullable, optional }) {
  const { pages } = useForm();
  return (
    <Labeled label={label} help={help} path={path} required={!optional}>
      <select value={value ?? ''} aria-label={label} onChange={(e) => onChange(e.target.value || (nullable ? null : undefined))}>
        {nullable && <option value="">— direttamente sotto la home —</option>}
        {pages.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
        {value && !pages.some((p) => p.key === value) && <option value={value}>{value} (non esiste)</option>}
      </select>
    </Labeled>
  );
}

function SharedRef({ value, onChange, path }) {
  const { sharedKeys } = useForm();
  return (
    <Labeled label="Blocco condiviso" path={path} required help="Si modifica in Condivisi: il cambiamento vale in tutte le pagine che lo usano.">
      <select value={value ?? ''} aria-label="Blocco condiviso" onChange={(e) => onChange(e.target.value)}>
        <option value="">— scegli —</option>
        {sharedKeys.map((k) => <option key={k} value={k}>{k}</option>)}
        {value && !sharedKeys.includes(value) && <option value={value}>{value} (non esiste)</option>}
      </select>
    </Labeled>
  );
}

// ---- oggetti -----------------------------------------------------------------------------------------------------------------

function ObjectField({ schema, value, onChange, path, ancestors, pick, omit = [], hideKeys = [], bare }) {
  const { s } = model.kindOf(schema);
  const obj = value ?? {};
  const required = new Set(s.required ?? []);
  const anc = [...ancestors, obj];
  const set = (k, v) => { const next = { ...obj }; if (v === undefined) delete next[k]; else next[k] = v; onChange(next); };
  const { idFor } = useForm();
  const isSharedVariant = s.title === 'Blocco condiviso';

  const fields = Object.keys(s.properties)
    .filter((k) => (!pick || pick.includes(k)) && !omit.includes(k) && !hideKeys.includes(k))
    .map((k) => {
      const ps = s.properties[k];
      const { kind, s: ds } = model.kindOf(ps);
      if (kind === 'hidden' || kind === 'const' || !isVisible(ps, anc)) return null;
      if (kind === 'enum' && ds.enum.length === 1) return null;
      const opt = !required.has(k);
      const label = ds.title ?? keyLabel(k) ?? humanizeKey(k);
      const p = `${path}/${k}`;
      if (isSharedVariant && k === 'ref') return <SharedRef key={k} value={obj[k]} onChange={(v) => set(k, v)} path={p} />;
      if (opt && ['object', 'image', 'link', 'union'].includes(kind) && obj[k] === undefined) {
        return <button key={k} type="button" className="add" onClick={() => set(k, model.defaultValue(ps, () => idFor('x')))}>+ {label}</button>;
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
  const { idFor } = useForm();
  const variants = model.variantsOf(schema);
  const cur = model.variantFor(schema, value) ?? variants[0];
  return (
    <Labeled label={label} help={help} path={path} onRemove={onRemove}>
      <select value={cur.value} aria-label={`${label ?? ''}: tipo`} onChange={(e) => { const v = variants.find((x) => x.value === e.target.value); onChange(model.defaultValue(v.schema, () => idFor(v.value))); }}>
        {variants.map((v) => <option key={v.value} value={v.value}>{labelFor(v.value)}</option>)}
      </select>
      <div className="sub"><ObjectField schema={cur.schema} value={value} onChange={onChange} path={path} ancestors={ancestors} /></div>
    </Labeled>
  );
}

// ---- elenchi ---------------------------------------------------------------------------------------------------------------------

function AddMenu({ label, variants, onPick, disabled }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="menu">
      <button type="button" className="add" disabled={disabled} aria-expanded={open} onClick={() => setOpen(!open)}>+ {label}</button>
      {open && (
        <ul className="menu__list" role="menu">
          {variants.map((v) => (
            <li key={v.value}>
              <button type="button" role="menuitem" onClick={() => { setOpen(false); onPick(v); }}>
                <strong>{v.title ?? 'Blocco condiviso'}</strong>
                {uiOf().blockHints[v.value] && <span>{uiOf().blockHints[v.value]}</span>}
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
      {items.length === 0 && <p className="fld__help">{isUnion ? 'Nessun blocco. Aggiungine uno.' : 'Nessun elemento.'}</p>}
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
                  <button type="button" className="ico" aria-label="Sposta su" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                  <button type="button" className="ico" aria-label="Sposta giù" disabled={i === items.length - 1} onClick={() => move(i, 1)}>↓</button>
                  <button type="button" className="ico" aria-label="Elimina" disabled={items.length <= min} onClick={() => remove(i)}>✕</button>
                </div>
              </li>
            );
          }
          return (
            <li key={item?.id ?? i} className={`item ${isOpen(i) ? 'is-open' : ''} ${hidden ? 'is-hidden' : ''}`} data-path={p}>
              <div className="item__head">
                <button type="button" className="item__toggle" aria-expanded={isOpen(i)} onClick={() => setOpen(items.map((_, k) => (k === i ? !isOpen(i) : isOpen(k))))}>
                  <span className="item__caret">{isOpen(i) ? '▾' : '▸'}</span>
                  <span className="item__type">{variant ? (variant.title ?? 'Blocco condiviso') : `${label ?? 'Elemento'} ${i + 1}`}</span>
                  <span className="item__sum">{summarize(item) || (variant?.value === 'shared' ? item.ref : '')}</span>
                  {hidden && <span className="badge">nascosto</span>}
                  {errCount > 0 && <span className="badge bad" title={`${errCount} da sistemare`}>{errCount}</span>}
                  {errCount === 0 && under.length > 0 && <span className="badge warn">avviso</span>}
                </button>
                <div className="ctl">
                  {canHide && <button type="button" className="ico" aria-label={hidden ? 'Mostra' : 'Nascondi'} title={hidden ? 'Mostra nel sito' : 'Nascondi dal sito'} onClick={() => toggleVisible(i)}>{hidden ? '◌' : '◉'}</button>}
                  <button type="button" className="ico" aria-label="Sposta su" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                  <button type="button" className="ico" aria-label="Sposta giù" disabled={i === items.length - 1} onClick={() => move(i, 1)}>↓</button>
                  <button type="button" className="ico" aria-label="Duplica" disabled={items.length >= max} onClick={() => duplicate(i)}>⧉</button>
                  <button type="button" className="ico" aria-label="Elimina" disabled={items.length <= min} onClick={() => remove(i)}>✕</button>
                </div>
              </div>
              {isOpen(i) && (
                <div className="item__body">
                  {isUnion && !variant
                    ? <p className="fld__issues"><span className="bad">Tipo di blocco sconosciuto: {String(item?.type)}</span></p>
                    : <ObjectField schema={objSchema} value={item} onChange={(v) => setItem(i, v)} path={p} ancestors={[...ancestors, items]} hideKeys={['visible']} />}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {isUnion
        ? <AddMenu label="Aggiungi blocco" variants={model.variantsOf(s.items)} onPick={add} disabled={items.length >= max} />
        : <button type="button" className="add" disabled={items.length >= max} onClick={() => add(null)}>+ Aggiungi {compact ? 'voce' : 'elemento'}</button>}
    </Labeled>
  );
}

// Mappa chiave → blocco (blocchi condivisi).
function MapField({ schema, value, onChange, path, ancestors }) {
  const { s } = model.kindOf(schema);
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
                  <span className="item__caret">{open[k] ? '▾' : '▸'}</span><span className="item__type">{k}</span><span className="item__sum">{variant?.title}</span>
                  {errs > 0 && <span className="badge bad">{errs}</span>}
                </button>
                <div className="ctl"><button type="button" className="ico" aria-label="Elimina" onClick={() => { const n = { ...obj }; delete n[k]; onChange(n); }}>✕</button></div>
              </div>
              {open[k] && variant && <div className="item__body"><ObjectField schema={variant.schema} value={b} onChange={(v) => onChange({ ...obj, [k]: { ...v, id: k } })} path={p} ancestors={[...ancestors, obj]} hideKeys={['visible', 'id']} /></div>}
            </li>
          );
        })}
      </ol>
      <div className="mapadd">
        <input placeholder="nome del blocco (es. nastro-servizi)" aria-label="Nome del nuovo blocco condiviso" value={name} onChange={(e) => setName(e.target.value.toLowerCase())} />
        <AddMenu label="Aggiungi blocco condiviso" variants={variants.filter((v) => v.value !== 'shared')} disabled={!valid} onPick={(v) => { const b = model.defaultValue(v.schema, () => name); onChange({ ...obj, [name]: { ...b, id: name } }); setOpen({ ...open, [name]: true }); setName(''); }} />
      </div>
      {name && !valid && <p className="fld__help">Il nome usa lettere minuscole, numeri e trattini, e non deve esistere già.</p>}
    </div>
  );
}

// ---- dispatcher -----------------------------------------------------------------------------------------------------------------

export function Field({ schema, value, onChange, path, ancestors = [], optional, label, help, pick, omit, hideKeys, onRemove, bare }) {
  const { issues } = useForm();
  const { kind, s, widget } = model.kindOf(schema);
  const title = label ?? s.title;
  const helpText = help ?? s.description;
  switch (kind) {
    case 'hidden': case 'const': return null;
    case 'i18n': return <I18nField schema={schema} value={value} onChange={onChange} path={path} optional={optional} label={title} help={helpText} widget={widget} onRemove={onRemove} />;
    case 'image': return <ImageField schema={schema} value={value} onChange={onChange} path={path} label={title} help={helpText} onRemove={onRemove} />;
    case 'mediaPath': return <MediaPathField value={value} onChange={onChange} path={path} label={title} help={helpText} optional={optional} />;
    case 'link': return <LinkField value={value} onChange={onChange} path={path} label={title} help={helpText} onRemove={onRemove} />;
    case 'pageKey': return <PageSelect value={value} onChange={onChange} path={path} label={title} help={helpText} optional={optional} />;
    case 'pageKeyNullable': return <PageSelect value={value} onChange={onChange} path={path} label={title} help={helpText} nullable optional />;
    case 'enum': return <EnumField s={s} value={value} onChange={onChange} path={path} optional={optional} label={title} help={helpText} />;
    case 'boolean': return (
      <Labeled path={path} help={helpText}>
        <label className="check"><input type="checkbox" checked={value ?? s.default ?? false} onChange={(e) => onChange(e.target.checked)} /> {title}</label>
      </Labeled>
    );
    case 'number': return <Labeled label={title} help={helpText} path={path} required={!optional}><NumInput value={value} label={title} min={s.minimum} max={s.maximum} onChange={onChange} /></Labeled>;
    case 'string': return (
      <Labeled label={title} help={helpText} path={path} required={!optional}>
        <input value={value ?? ''} aria-label={title} onChange={(e) => onChange(e.target.value === '' && optional ? undefined : e.target.value)} />
      </Labeled>
    );
    case 'union': return <UnionField schema={schema} value={value} onChange={onChange} path={path} ancestors={ancestors} label={title} help={helpText} onRemove={onRemove} />;
    case 'array': return <ArrayField schema={schema} value={value} onChange={onChange} path={path} ancestors={ancestors} optional={optional} label={title} help={helpText} />;
    case 'map': return <MapField schema={schema} value={value} onChange={onChange} path={path} ancestors={ancestors} />;
    case 'object': {
      if (bare) return <ObjectField schema={schema} value={value} onChange={onChange} path={path} ancestors={ancestors} pick={pick} omit={omit} hideKeys={hideKeys} bare />;
      return (
        <fieldset className="grp" data-path={path}>
          {(title || onRemove) && (
            <legend>{title}{onRemove && <button type="button" className="mini" onClick={onRemove}>Rimuovi</button>}</legend>
          )}
          {helpText && <p className="fld__help">{helpText}</p>}
          <ObjectField schema={schema} value={value} onChange={onChange} path={path} ancestors={ancestors} pick={pick} omit={omit} hideKeys={hideKeys} />
          <Issues list={issuesAt(issues, path)} />
        </fieldset>
      );
    }
    default: return null;
  }
}
