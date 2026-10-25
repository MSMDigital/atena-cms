'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useT, useLang } from '@/app/admin/_i18n/I18nProvider';
import { langName } from '@/render/locales.mjs';
import { createTranslationAction } from './actions';

// Pezzi in comune delle tabelle di articoli e pagine: semaforo, scelta dell'autore, messaggio dopo «Aggiorna».
// Il nome di una lingua nella lingua dell'admin: const name = useLangName(); name('en').
export function useLangName() { const lang = useLang(); return (code) => langName(code, lang); }
export const dateTime = (v) => (v ? `${v.slice(8, 10)}.${v.slice(5, 7)}.${v.slice(0, 4)} ${v.slice(11, 16)}` : '');
const LEVEL = { green: 'tutto a posto', amber: 'da migliorare', red: 'manca qualcosa di importante' };

// Semaforo: solo il pallino colorato; il dettaglio è nel suggerimento e per chi usa uno screen reader.
export function Light({ label, info }) {
  const t = useT();
  const tip = `${label}: ${t(LEVEL[info.level])}${info.issues.length ? `\n• ${info.issues.map((i) => t(i.text)).join('\n• ')}` : ''}`;
  return <span className={`light light--${info.level}`} role="img" aria-label={tip.replace(/\n/g, ' ')} title={tip} />;
}

// Autore: uno degli utenti del CMS (si salva il nome); un nome che non è più tra gli utenti resta scelto finché non lo si cambia.
export function AuthorSelect({ value, onChange, authors, keepEmpty = '— nessuno —' }) {
  const t = useT();
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{t(keepEmpty)}</option>
      {authors.map((n) => <option key={n} value={n}>{n}</option>)}
      {value && !authors.includes(value) && <option value={value}>{value}</option>}
    </select>
  );
}

// Esito di «Aggiorna» nella modifica rapida (equivale a una pubblicazione, ma solo per un admin).
export function quickEditMessage(r, t) {
  if (r.published) return { tone: 'ok', text: t('Aggiornato e pubblicato.') };
  if (r.publishError) return { tone: 'bad', text: t('Salvato, ma la pubblicazione non è riuscita: {x}', { x: t(r.publishError) }) };
  return { tone: 'warn', text: t('Salvato come bozza: la pubblicazione la fa un admin.') };
}

export const slugify = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 75);

// Esito di un'azione di massa (le azioni di massa pubblicano, ma solo per un admin).
export function bulkMessage(r, verb, t) {
  const base = `${r.done} ${t(verb)}.${r.skipped?.length ? ` ${t('Non modificati: {x}.', { x: r.skipped.map((k) => t(k)).join('; ') })}` : ''}`;
  if (r.published) return { tone: r.skipped?.length ? 'warn' : 'ok', text: `${base} ${t('Pubblicato.')}` };
  if (r.publishError) return { tone: 'bad', text: `${base} ${t('La pubblicazione non è riuscita: {x}', { x: t(r.publishError) })}` };
  return { tone: r.skipped?.length ? 'warn' : 'ok', text: `${base} ${t('Salvati come bozze: la pubblicazione la fa un admin.')}` };
}

// Gestione dell'indirizzo (slug): anteprima dell'URL, «Dal titolo», doppioni e avviso se il link già online cambia.
// `base`: la parte fissa dell'URL (per esempio /blog/); `taken`: gli indirizzi già usati da altri nella stessa lingua; `original`: l'indirizzo attuale.
export function SlugField({ label, value, onChange, source, base, taken = [], original = '', required = false, online = false, home = false }) {
  const t = useT();
  const v = value ?? '';
  const invalid = v !== '' && !/^[a-z0-9-]+$/.test(v);
  const dup = v !== '' && taken.includes(v);
  const changed = online && original !== '' && v !== original;
  return (
    <div className="slugf">
      <label>{label}
        <span className="slugf__row">
          <input value={v} required={required} onChange={(e) => onChange(e.target.value)} pattern="[a-z0-9\-]+" title={t('Lettere minuscole, numeri e trattini')} aria-invalid={invalid || dup} />
          <button type="button" className="btn" onClick={() => onChange(slugify(source))} disabled={!source}>{t('Dal titolo')}</button>
        </span>
      </label>
      {base != null && <span className="slugf__url muted">{base}{v ? `${v}/` : ''}</span>}
      {invalid && <span className="slugf__warn">{t('Solo lettere minuscole, numeri e trattini.')}</span>}
      {dup && <span className="slugf__warn">{t('Questo indirizzo è già usato da un altro elemento.')}</span>}
      {changed && !dup && !invalid && <span className="slugf__note">{t("Cambia l'indirizzo di un contenuto già online: il vecchio link smetterà di funzionare.")}</span>}
    </div>
  );
}

// Le lingue di una pagina o di un articolo: una pastiglia per lingua (piena = online, tratteggiata = bozza), «+» per creare la versione che manca.
export function Versions({ versions, baseKey, kind }) {
  const t = useT();
  const name = useLangName();
  const router = useRouter();
  const [busy, start] = useTransition();
  const [err, setErr] = useState(null);
  if (!versions) return null;
  const make = (lang) => start(async () => { const r = await createTranslationAction(baseKey, lang, kind); if (r.ok) router.refresh(); else setErr(r.error); });
  return (
    <span className="langchips">
      {versions.map((v) => v.missing
        ? <button key={v.lang} type="button" className="langchip langchip--missing" disabled={busy} title={t('Crea la versione in {lang}', { lang: name(v.lang) })} onClick={() => make(v.lang)}>+ {v.lang.toUpperCase()}</button>
        : <Link key={v.lang} href={`/admin/${kind === 'post' ? 'posts' : 'pages'}/${v.key}`} className={`langchip ${v.status === 'published' && v.state === 'clean' ? 'langchip--on' : v.status === 'published' ? 'langchip--changed' : 'langchip--draft'}`} title={`${name(v.lang)}: ${v.status === 'published' ? (v.state === 'clean' ? t('Pubblicata') : t('Modifiche non pubblicate')) : t('Bozza')}`}>{v.lang.toUpperCase()}</Link>)}
      {err && <span className="muted" role="alert"> {err}</span>}
    </span>
  );
}

