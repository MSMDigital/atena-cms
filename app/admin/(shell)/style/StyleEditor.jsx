'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { tokensToCss, validateTokens, previewFontsHref, htmlAttrs, HEADINGS, TEXT, DISPLAY, EFFECTS } from '@/render/tokens.mjs';
import { resolveToken, contrast, overBackground, grade, parseColor } from '@/lib/color.mjs';
import { saveTokensAction } from './actions';
import { publishAction } from '../actions';
import { useT } from '@/app/admin/_i18n/I18nProvider';

// ---- etichette --------------------------------------------------------------------------------

const SCALE_LABELS = { h1: 'Titolo 1 (h1)', h2: 'Titolo 2 (h2)', h3: 'Titolo 3 (h3)', h4: 'Titolo 4 (h4)', h5: 'Titolo 5 (h5)', h6: 'Titolo 6 (h6)', lead: 'Testo introduttivo', body: 'Paragrafo', small: 'Testo piccolo', xs: 'Extra piccolo', micro: 'Etichette' };
const DISPLAY_LABELS = { hero: 'Titolo della home', marquee: 'Nastro scorrevole', list: 'Titoli dell\'elenco servizi', split: 'Titoli testo + immagine', cta: 'Titolo della CTA finale', ctaWord: 'Parola verticale della CTA', zones: 'Zone servite', quote: 'Citazione', footer: 'Claim del footer', number: 'Numeri grandi', pointNumber: 'Numeri dei punti' };
const SURFACE_NAMES = { light: 'Chiara', dark: 'Scura', brand: 'Brand' };
const SURFACE_FIELDS = [['bg', 'Sfondo', true], ['ink', 'Testo', false], ['inkSoft', 'Testo secondario', false], ['muted', 'Testo attenuato', false], ['line', 'Linee sottili', false], ['rule', 'Linee forti', true], ['accent', 'Accento (link, etichette)', true], ['fill', 'Riempimento al passaggio', true]];
const REF_LABELS = { '@brand': 'Colore brand', '@brandTint': 'Brand su scuro', '@ink': 'Colore del testo' };
const EFFECT_LABELS = { arrow: ['Freccia', 'La freccia scatta in avanti (come oggi).'], fill: ['Riempimento', 'Il colore di passaggio scorre da sinistra.'], lift: ['Sollevamento', 'Il pulsante si alza con un\'ombra.'], none: ['Nessuno', 'Cambia solo il colore.'] };
const RADII = [['Pillola', '999px'], ['Arrotondato', '12px'], ['Squadrato', '0px']];
const FONTS = ['Raleway', 'Inter', 'Open Sans', 'Montserrat', 'Poppins', 'Lato', 'Roboto', 'Nunito', 'Work Sans', 'DM Sans', 'Manrope', 'Source Sans 3', 'Playfair Display', 'Lora', 'Merriweather', 'Cormorant Garamond', 'Space Grotesk'];
const WEIGHTS = [300, 400, 500, 600, 700];
const DEVICES = { desktop: 1440, mobile: 390 };

// Errori di validazione con il nome del campo come lo vede l'utente.
const SUGGEST = [
  [/serve size/, 'mobile e desktop devono essere numeri in px tra 8 e 400; il tetto non può essere più piccolo del desktop.'],
  [/colore non valido/, 'colore non valido (es. #0348ad).'],
  [/weight/, 'il peso va da 100 a 900.'],
  [/lineHeight/, "l'interlinea va da 0,5 a 3."],
  [/tracking/, 'la spaziatura è un numero in em (es. -0.02).'],
  [/radius/, 'il raggio è una misura (es. 999px, 12px, 0px).'],
];
function humanize(e, t) {
  const [path, ...rest] = e.split(': ');
  const text = rest.join(': ');
  const hint = t(SUGGEST.find(([re]) => re.test(e))?.[1] ?? text);
  let m;
  if ((m = path.match(/^typography\.scale\.(\w+)/))) return `${t(SCALE_LABELS[m[1]])}: ${hint}`;
  if ((m = path.match(/^typography\.display\.(\w+)/))) return `${t(DISPLAY_LABELS[m[1]])}: ${hint}`;
  if ((m = path.match(/^surfaces\.(\w+)\.(\w+)/))) return `${t('Superficie')} ${t(SURFACE_NAMES[m[1]]).toLowerCase()}, ${t(SURFACE_FIELDS.find((f) => f[0] === m[2])?.[1] ?? m[2]).toLowerCase()}: ${hint}`;
  if ((m = path.match(/^colors\.(\w+)/))) return `${t('Colore')} ${t({ brand: 'brand', brandTint: 'brand su scuro', whatsapp: 'WhatsApp' }[m[1]])}: ${hint}`;
  if (path.startsWith('typography.fonts')) return `Font: ${t(text)}`;
  if (path.startsWith('buttons')) return `${t('Pulsanti')}: ${hint}`;
  if (path.startsWith('layout')) return `Layout: ${t(text)}`;
  return e;
}

const setIn = (obj, path, value) => {
  const next = structuredClone(obj);
  let o = next;
  for (const k of path.slice(0, -1)) o = o[k];
  const last = path.at(-1);
  if (value === undefined) delete o[last]; else o[last] = value;
  return next;
};

// ---- campi -------------------------------------------------------------------------------------

// Numero con testo libero (si può scrivere "46." senza che il campo si azzeri); avvisa solo quando il valore è un numero valido.
function Num({ value, onChange, placeholder, label }) {
  const [text, setText] = useState(value == null ? '' : String(value));
  const last = useRef(value);
  useEffect(() => { if (value !== last.current) { setText(value == null ? '' : String(value)); last.current = value; } }, [value]);
  return (
    <input
      className="num" type="text" inputMode="decimal" value={text} placeholder={placeholder} aria-label={label}
      onChange={(e) => {
        const v = e.target.value; setText(v);
        const n = v.trim() === '' ? undefined : Number(v.replace(',', '.'));
        if (n === undefined || Number.isFinite(n)) { last.current = n; onChange(n); }
      }}
    />
  );
}

function ColorInput({ value, onChange, refs, resolved, label }) {
  const t = useT();
  const isRef = typeof value === 'string' && value.startsWith('@');
  const c = parseColor(isRef ? (resolved ?? '#000000') : value);
  const picker = c ? '#' + c.slice(0, 3).map((n) => Math.round(n).toString(16).padStart(2, '0')).join('') : '#000000';
  return (
    <div className="color">
      {refs && (
        <select aria-label={`${label}: ${t('origine')}`} value={isRef ? value : ''} onChange={(e) => onChange(e.target.value || picker)}>
          <option value="">{t('Personalizzato')}</option>
          {refs.map((r) => <option key={r} value={r}>{t(REF_LABELS[r])}</option>)}
        </select>
      )}
      {!isRef && (
        <>
          <input type="color" aria-label={label} value={picker} onChange={(e) => onChange(e.target.value)} />
          <input className="hex" type="text" aria-label={`${label}: ${t('valore')}`} value={value} spellCheck={false} onChange={(e) => onChange(e.target.value)} />
        </>
      )}
    </div>
  );
}

function Section({ title, hint, children, open = true }) {
  return (
    <details className="sec" open={open}>
      <summary>{title}</summary>
      {hint && <p className="hint">{hint}</p>}
      <div className="sec__body">{children}</div>
    </details>
  );
}

const Row = ({ label, children }) => <label className="row"><span>{label}</span><div>{children}</div></label>;

// ---- editor ------------------------------------------------------------------------------------

export default function StyleEditor({ initial, published, state, rev: initialRev, pages }) {
  const tr = useT();
  const [rev, setRev] = useState(initialRev);
  const [t, setT] = useState(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [live, setLive] = useState(published ? JSON.stringify(published) : null);
  const [surface, setSurface] = useState('light');
  const [msg, setMsg] = useState(null);
  const [busy, start] = useTransition();

  const set = useCallback((path, value) => setT((cur) => setIn(cur, path, value)), []);
  const errors = useMemo(() => validateTokens(t), [t]);
  const dirty = JSON.stringify(t) !== saved;
  const unpublished = saved !== live;

  // Anteprima: iframe con la bozza salvata, aggiornata dal vivo con i valori correnti (anche non salvati).
  const frame = useRef(null);
  const stage = useRef(null);
  const [device, setDevice] = useState('desktop');
  const [path, setPath] = useState('/');
  const [box, setBox] = useState({ w: 800, h: 600 });
  const payload = useMemo(() => (errors.length ? null : { type: 'cms-live-style', css: tokensToCss(t), fontsHref: previewFontsHref(t), htmlAttrs: htmlAttrs(t) }), [t, errors.length]);
  const send = useCallback(() => { if (payload) frame.current?.contentWindow?.postMessage(payload, '*'); }, [payload]);   // l'anteprima ha un'origine opaca (sandbox): il bersaglio non si può indicare
  useEffect(send, [send]);
  // Un font nuovo lo scarica il server (serve la sessione): si chiede qui, con il cookie, poi l'anteprima lo legge dalla cache locale.
  const fontsHref = payload?.fontsHref;
  useEffect(() => { if (fontsHref) fetch(fontsHref, { credentials: 'same-origin' }).then(send, () => {}); }, [fontsHref, send]);
  // L'HTML dell'anteprima lo scarica questa pagina (con la sessione) e lo passa all'iframe in srcdoc: l'iframe, sandboxed, non deve dipendere
  // dal cookie né poter caricare al suo interno una pagina dell'admin (per esempio il login).
  useEffect(() => {
    let stale = false;
    const note = (msg) => `<!doctype html><meta charset="utf-8"><body style="font:16px system-ui;padding:2rem;color:#444">${msg}</body>`;
    fetch(`/admin/preview${path === '/' ? '' : path}`, { credentials: 'same-origin', cache: 'no-store' })
      .then(async (r) => (r.ok ? r.text() : note(r.status === 401 ? tr('Sessione scaduta: ricarica la pagina e accedi di nuovo.') : tr('Anteprima non disponibile per questa pagina.'))))
      .catch(() => note(tr('Anteprima non raggiungibile.')))
      .then((html) => { if (!stale && frame.current) frame.current.srcdoc = html; });
    return () => { stale = true; };
  }, [path]);
  useEffect(() => {
    // I link dell'anteprima non navigano da soli: dall'iframe sandboxed il browser non invierebbe il cookie di sessione. Avvisano l'editor,
    // che cambia l'indirizzo dell'iframe. Si riconosce chi scrive dalla finestra (l'origine è opaca).
    const onMsg = (e) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      const d = e.data;
      if (!d || typeof d !== 'object' || d.type !== 'cms-navigate' || typeof d.href !== 'string') return;
      if (d.href !== '/admin/preview' && !d.href.startsWith('/admin/preview/')) return;
      const p = d.href.replace(/^\/admin\/preview/, '') || '/';
      setPath(p.endsWith('/') ? p : p + '/');
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);
  useEffect(() => {
    if (!stage.current) return undefined;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(stage.current);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const warn = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const W = DEVICES[device];
  const scale = Math.min(1, (box.w - 24) / W);

  const save = () => start(async () => {
    const r = await saveTokensAction(t, rev);
    if (r.ok) { setSaved(JSON.stringify(t)); setRev(r.rev); setMsg({ tone: 'ok', text: r.changed ? tr('Bozza salvata.') : tr('Nessuna modifica da salvare.') }); }
    else setMsg({ tone: 'bad', text: tr('Non salvato:') + ' ' + r.errors.map((e) => humanize(e, tr)).join(' ') });
  });
  const publish = () => start(async () => {
    const r = await publishAction();
    if (r.ok) { setLive(saved); setMsg({ tone: 'ok', text: r.nothing ? tr('Niente da pubblicare.') : tr('Pubblicato: {n} pagine.', { n: r.pages }) }); }
    else setMsg({ tone: 'bad', text: `${tr(r.error)}. ${tr('Il sito online non è cambiato.')} ${r.details?.join('; ') ?? ''}` });
  });

  // Contrasto testo/sfondo della superficie scelta.
  const bgC = resolveToken(t.surfaces[surface].bg, t, surface);
  const contrastRows = [['ink', tr('Testo')], ['inkSoft', tr('Testo secondario')], ['muted', tr('Testo attenuato')], ['accent', tr('Accento')]].map(([k, label]) => {
    const fg = resolveToken(t.surfaces[surface][k], t, surface);
    if (!fg || !bgC) return { label, ratio: null };
    const ratio = contrast(overBackground(fg, bgC), bgC.slice(0, 3));
    return { label, ratio, grade: tr(grade(ratio)) };
  });

  const scaleRow = (k, withType) => {
    const s = t.typography.scale[k];
    const p = ['typography', 'scale', k];
    const trackNum = s.tracking != null ? parseFloat(s.tracking) : undefined;
    return (
      <tr key={k}>
        <th scope="row">{tr(SCALE_LABELS[k])}</th>
        <td><Num value={s.size[0]} label={`${tr(SCALE_LABELS[k])}: ${tr('mobile')}`} onChange={(v) => set([...p, 'size'], [v, s.size[1]])} /></td>
        <td><Num value={s.size[1]} label={`${tr(SCALE_LABELS[k])}: ${tr('desktop')}`} onChange={(v) => set([...p, 'size'], [s.size[0], v])} /></td>
        <td><Num value={s.max} placeholder="—" label={`${tr(SCALE_LABELS[k])}: ${tr('tetto')}`} onChange={(v) => set([...p, 'max'], v)} /></td>
        {withType && (
          <>
            <td>{s.weight != null ? <select aria-label={`${tr(SCALE_LABELS[k])}: ${tr('peso')}`} value={s.weight} onChange={(e) => set([...p, 'weight'], +e.target.value)}>{[...new Set([...WEIGHTS, s.weight])].sort().map((w) => <option key={w}>{w}</option>)}</select> : null}</td>
            <td>{s.lineHeight != null ? <Num value={s.lineHeight} label={`${tr(SCALE_LABELS[k])}: ${tr('interlinea')}`} onChange={(v) => set([...p, 'lineHeight'], v)} /> : null}</td>
            <td>{s.tracking != null ? <Num value={trackNum} label={`${tr(SCALE_LABELS[k])}: ${tr('spaziatura')}`} onChange={(v) => set([...p, 'tracking'], v === undefined ? undefined : `${v}em`)} /> : null}</td>
          </>
        )}
      </tr>
    );
  };

  return (
    <div className="editor">
      <div className="editor__panel">
        <div className="editor__scroll">
          <h1>{tr('Stile')}</h1>
          <p className="hint">{tr('Le modifiche si vedono subito nell\'anteprima. Il sito online cambia solo quando le pubblichi.')}</p>

          <Section title={tr('Colori del marchio')}>
            <Row label={tr('Brand')}><ColorInput label={tr('Brand')} value={t.colors.brand} onChange={(v) => set(['colors', 'brand'], v)} /></Row>
            <Row label={tr('Brand su scuro')}><ColorInput label={tr('Brand su scuro')} value={t.colors.brandTint} onChange={(v) => set(['colors', 'brandTint'], v)} /></Row>
            <Row label="WhatsApp"><ColorInput label="WhatsApp" value={t.colors.whatsapp} onChange={(v) => set(['colors', 'whatsapp'], v)} /></Row>
          </Section>

          <Section title={tr('Superfici')} hint={tr('Ogni sezione della pagina ha una superficie: chiara, scura o brand.')}>
            <div className="seg" role="tablist">
              {Object.keys(SURFACE_NAMES).map((s) => <button key={s} role="tab" aria-selected={surface === s} className={surface === s ? 'on' : ''} onClick={() => setSurface(s)}>{tr(SURFACE_NAMES[s])}</button>)}
            </div>
            {SURFACE_FIELDS.map(([k, label, refs]) => (
              <Row key={k} label={tr(label)}>
                <ColorInput label={`${tr(SURFACE_NAMES[surface])}: ${tr(label)}`} value={t.surfaces[surface][k]} refs={refs ? ['@brand', '@brandTint', '@ink'].filter((r) => !(r === '@ink' && k === 'ink')) : null}
                  resolved={(() => { const c = resolveToken(t.surfaces[surface][k], t, surface); return c ? '#' + c.slice(0, 3).map((n) => Math.round(n).toString(16).padStart(2, '0')).join('') : undefined; })()}
                  onChange={(v) => set(['surfaces', surface, k], v)} />
              </Row>
            ))}
            <div className="contrast" aria-label={tr('Contrasto sullo sfondo')}>
              <strong>{tr('Leggibilità sullo sfondo')}</strong>
              {contrastRows.map((c) => (
                <div key={c.label} className={`contrast__row ${c.ratio == null ? '' : c.ratio >= 4.5 ? 'ok' : c.ratio >= 3 ? 'warn' : 'bad'}`}>
                  <span>{c.label}</span>
                  <span>{c.ratio == null ? '—' : `${c.ratio.toFixed(1)}:1 · ${c.grade}`}</span>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Font" hint={tr('Vengono scaricati e serviti dal sito alla pubblicazione (nessuna richiesta a Google dai visitatori).')}>
            <datalist id="fonts">{FONTS.map((f) => <option key={f} value={f} />)}</datalist>
            <Row label={tr('Testi')}><input list="fonts" value={t.typography.fonts.body} onChange={(e) => set(['typography', 'fonts', 'body'], e.target.value)} aria-label={tr('Font dei testi')} /></Row>
            <Row label={tr('Titoli')}><input list="fonts" value={t.typography.fonts.heading} onChange={(e) => set(['typography', 'fonts', 'heading'], e.target.value)} aria-label={tr('Font dei titoli')} /></Row>
          </Section>

          <Section title={tr('Titoli e paragrafi')} hint={tr('Dimensioni in px su mobile (390) e su desktop (1440); in mezzo crescono in modo fluido. Il tetto è la misura massima su schermi più larghi.')}>
            <div className="tablewrap">
              <table className="scale">
                <thead><tr><th /><th>{tr('Mobile')}</th><th>{tr('Desktop')}</th><th>{tr('Tetto')}</th><th>{tr('Peso')}</th><th>{tr('Interlinea')}</th><th>{tr('Spazio (em)')}</th></tr></thead>
                <tbody>
                  {HEADINGS.map((k) => scaleRow(k, true))}
                  {['lead', 'body'].map((k) => scaleRow(k, true))}
                  {['small', 'xs', 'micro'].map((k) => scaleRow(k, false))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title={tr('Testi grandi')} hint={tr('Titoli e numeri dei componenti (home, nastro, CTA...).')}>
            <div className="tablewrap">
              <table className="scale">
                <thead><tr><th /><th>{tr('Mobile')}</th><th>{tr('Desktop')}</th><th>{tr('Tetto')}</th></tr></thead>
                <tbody>
                  {DISPLAY.map((k) => {
                    const s = t.typography.display[k];
                    const p = ['typography', 'display', k];
                    return (
                      <tr key={k}>
                        <th scope="row">{tr(DISPLAY_LABELS[k])}</th>
                        <td><Num value={s.size[0]} label={`${tr(DISPLAY_LABELS[k])}: ${tr('mobile')}`} onChange={(v) => set([...p, 'size'], [v, s.size[1]])} /></td>
                        <td><Num value={s.size[1]} label={`${tr(DISPLAY_LABELS[k])}: ${tr('desktop')}`} onChange={(v) => set([...p, 'size'], [s.size[0], v])} /></td>
                        <td><Num value={s.max} placeholder="—" label={`${tr(DISPLAY_LABELS[k])}: ${tr('tetto')}`} onChange={(v) => set([...p, 'max'], v)} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title={tr('Pulsanti')}>
            <fieldset className="effects">
              <legend>{tr('Effetto al passaggio')}</legend>
              {EFFECTS.map((e) => (
                <label key={e} className={t.buttons.effect === e ? 'on' : ''}>
                  <input type="radio" name="effect" checked={t.buttons.effect === e} onChange={() => set(['buttons', 'effect'], e)} />
                  <strong>{tr(EFFECT_LABELS[e][0])}</strong><span>{tr(EFFECT_LABELS[e][1])}</span>
                </label>
              ))}
            </fieldset>
            <Row label={tr('Angoli')}>
              <div className="chips">
                {RADII.map(([n, v]) => <button key={v} className={t.buttons.radius === v ? 'on' : ''} onClick={() => set(['buttons', 'radius'], v)}>{tr(n)}</button>)}
                <input className="hex" value={t.buttons.radius} aria-label={tr('Raggio degli angoli')} onChange={(e) => set(['buttons', 'radius'], e.target.value)} />
              </div>
            </Row>
            <Row label={tr('Altezza minima (px)')}><Num value={t.buttons.minHeight} label={tr('Altezza minima')} onChange={(v) => set(['buttons', 'minHeight'], v)} /></Row>
            <Row label={tr('Peso del testo')}><select value={t.buttons.weight} onChange={(e) => set(['buttons', 'weight'], +e.target.value)}>{WEIGHTS.map((w) => <option key={w}>{w}</option>)}</select></Row>
          </Section>

          <Section title="Layout" open={false}>
            <Row label={tr('Larghezza massima (px)')}><Num value={t.layout.maxWidth} label={tr('Larghezza massima')} onChange={(v) => set(['layout', 'maxWidth'], v)} /></Row>
            <Row label={tr('Altezza header (px)')}><Num value={t.layout.headerHeight} label={tr('Altezza header')} onChange={(v) => set(['layout', 'headerHeight'], v)} /></Row>
            <Row label={tr('Altezza header mobile (px)')}><Num value={t.layout.headerHeightMobile} label={tr('Altezza header mobile')} onChange={(v) => set(['layout', 'headerHeightMobile'], v)} /></Row>
            <Row label={tr('Margini laterali')}><input className="hex" value={t.layout.gutter} onChange={(e) => set(['layout', 'gutter'], e.target.value)} /></Row>
            <Row label={tr('Spazio tra sezioni')}><input className="hex" value={t.layout.section} onChange={(e) => set(['layout', 'section'], e.target.value)} /></Row>
          </Section>
        </div>

        <div className="editor__bar">
          {errors.length > 0 && <ul className="errors" role="alert">{errors.slice(0, 3).map((e) => <li key={e}>{humanize(e, tr)}</li>)}{errors.length > 3 && <li>{tr('…e altri {n}', { n: errors.length - 3 })}</li>}</ul>}
          {msg && <p className={`notice notice--${msg.tone}`} role="status">{msg.text}</p>}
          <div className="editor__actions">
            <span className="muted">{dirty ? tr('Modifiche non salvate') : unpublished ? tr('Bozza salvata, non pubblicata') : tr('Uguale alla versione online')}</span>
            <button className="btn" disabled={!dirty || busy} onClick={() => { setT(JSON.parse(saved)); setMsg(null); }}>{tr('Annulla')}</button>
            {live && saved !== live && <button className="btn" disabled={busy} onClick={() => setT(JSON.parse(live))} title={tr('Carica i valori attualmente online (poi salva)')}>{tr('Torna all\'online')}</button>}
            <button className="btn" disabled={!dirty || busy || errors.length > 0} onClick={save}>{tr('Salva bozza')}</button>
            <button className="btn btn--primary" disabled={dirty || busy || !unpublished} onClick={publish} title={dirty ? tr('Salva prima la bozza') : ''}>{tr('Pubblica')}</button>
          </div>
        </div>
      </div>

      <div className="editor__preview">
        <div className="preview__bar">
          <select value={path} onChange={(e) => setPath(e.target.value)} aria-label={tr('Pagina in anteprima')}>
            {pages.map((p) => <option key={p.key} value={p.path}>{p.name}</option>)}
          </select>
          <div className="seg">
            {Object.keys(DEVICES).map((d) => <button key={d} className={device === d ? 'on' : ''} onClick={() => setDevice(d)}>{d === 'desktop' ? tr('Desktop') : tr('Mobile')}</button>)}
          </div>
          <span className="muted">{Math.round(scale * 100)}%</span>
        </div>
        <div className="preview__stage" ref={stage}>
          <div style={{ width: W * scale, height: (box.h - 24) , margin: '0 auto', position: 'relative' }}>
            <iframe
              ref={frame} title={tr('Anteprima del sito')} sandbox="allow-scripts" onLoad={send}
              style={{ width: W, height: (box.h - 24) / scale, transform: `scale(${scale})`, transformOrigin: 'top left' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
