'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LOCALES, DEFAULT_TAG, langName } from '@/render/locales.mjs';
import { useT, useLang } from '@/app/admin/_i18n/I18nProvider';
import { saveLocalesAction } from '../actions';

// Le parti tra \u0001 … \u0001 vanno in <code>.
const code = (text) => text.split('\u0001').map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part));

export default function LanguagesForm({ initial }) {
  const t = useT();
  const lang = useLang();
  const name = (l) => langName(l, lang);
  const router = useRouter();
  const [enabled, setEnabled] = useState(initial.enabled ?? ['it']);
  const [def, setDef] = useState(initial.default ?? 'it');
  const [tags, setTags] = useState({ ...DEFAULT_TAG, ...(initial.tags ?? {}) });
  const [msg, setMsg] = useState(null);
  const [busy, start] = useTransition();
  const [adding, setAdding] = useState('');
  const [baseLang, setBaseLang] = useState(initial.base ?? initial.default ?? 'it');
  const needBase = !initial.base && enabled.length > 1;   // più lingue e ancora non si sa in quale sono scritti i contenuti
  const newOnes = enabled.filter((l) => !(initial.enabled ?? ['it']).includes(l));
  const available = LOCALES.filter((l) => !enabled.includes(l));
  const add = () => { if (!adding) return; setEnabled(LOCALES.filter((x) => x === adding || enabled.includes(x))); setAdding(''); setMsg(null); };
  const remove = (l) => { if (enabled.length === 1 || l === def || l === initial.base) return; setEnabled(enabled.filter((x) => x !== l)); setMsg(null); };
  const submit = (e) => {
    e.preventDefault();
    setMsg(null);
    start(async () => {
      const r = await saveLocalesAction({ enabled, default: def, tags, baseLang: needBase ? baseLang : undefined });
      if (r.ok) { setMsg({ tone: 'ok', text: r.disabled ? t('Salvato come bozza. {n} pagine e articoli nelle lingue tolte sono stati messi in bozza e disattivati: escono dal sito alla prossima pubblicazione.', { n: r.disabled }) : r.created ? t('Salvato come bozza. Create {n} versioni di pagina in bozza: traducile e pubblicale da «Pagine».', { n: r.created }) : t('Salvato come bozza: per metterle online premi «Pubblica».') }); router.refresh(); }
      else setMsg({ tone: 'bad', text: r.error });
    });
  };
  return (
    <form className="uf" onSubmit={submit}>
      {msg && <p className={`notice notice--${msg.tone}`} role="status">{msg.text}</p>}
      <section className="card uf__sec">
        <h2>{t('Lingue del sito')}</h2>
        <table className="table">
          <thead><tr><th>{t('Lingua')}</th><th>{t('Predefinita')}</th><th>{t('Codice')}</th><th /></tr></thead>
          <tbody>
            {enabled.map((l) => (
              <tr key={l}>
                <td><strong>{name(l)}</strong></td>
                <td><input type="radio" name="def" checked={def === l} onChange={() => setDef(l)} aria-label={t('{lang} come lingua predefinita', { lang: name(l) })} /></td>
                <td><input value={tags[l] ?? ''} onChange={(e) => setTags({ ...tags, [l]: e.target.value })} placeholder={DEFAULT_TAG[l]} aria-label={t('Codice di {lang}', { lang: name(l) })} pattern="[a-z]{2}(-[A-Z]{2})?" title={t('Per esempio it-CH o en-GB')} size={8} /></td>
                <td>{enabled.length > 1 && def !== l && initial.base !== l ? <button type="button" className="link link--danger" onClick={() => remove(l)}>{t('Togli')}</button> : <span className="muted">{def === l ? t('predefinita') : initial.base === l ? t('lingua di base') : ''}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {available.length > 0 && (
          <div className="mailset__actions">
            <select value={adding} onChange={(e) => setAdding(e.target.value)} aria-label={t('Lingua da aggiungere')}>
              <option value="">{t('Aggiungi una lingua…')}</option>
              {[...available].sort((a, b) => name(a).localeCompare(name(b), lang)).map((l) => <option key={l} value={l}>{name(l)}</option>)}
            </select>
            <button type="button" className="btn" disabled={!adding} onClick={add}>{t('Aggiungi lingua')}</button>
          </div>
        )}
        {(initial.enabled ?? ['it']).some((l) => !enabled.includes(l)) && <p className="notice notice--bad" role="status">{t('Togliendo una lingua, tutte le sue pagine e i suoi articoli vengono messi in bozza e disattivati: non si perdono, e ritornano se riattivi la lingua.')}</p>}
        {needBase && (
          <div className="fld">
            <label htmlFor="base-lang">{t('In quale lingua sono scritti i contenuti attuali?')}</label>
            <select id="base-lang" value={baseLang} onChange={(e) => setBaseLang(e.target.value)}>
              {enabled.map((l) => <option key={l} value={l}>{name(l)}</option>)}
            </select>
            <p className="fld__help">{t('Le pagine e i testi di adesso verranno assegnati a questa lingua. Per ogni altra lingua attiva ogni pagina viene duplicata in bozza, con il titolo «Titolo - XX» (XX è il codice della lingua): poi la traduci e la pubblichi quando è pronta.')}</p>
          </div>
        )}
        {!needBase && newOnes.length > 0 && initial.base && <p className="fld__help">{t('Salvando, ogni pagina avrà la versione in bozza nelle nuove lingue, con il titolo «Titolo - XX».')}</p>}
        {initial.base && <p className="fld__help">{t('Lingua dei contenuti di base: {lang}. Non si cambia più.', { lang: name(initial.base) })}</p>}
        <p className="fld__help">{code(t('Il codice (per esempio {a}, {b}) dice ai browser e ai motori di ricerca lingua e paese del sito: compare solo per le lingue attive. La lingua predefinita è quella che si apre per prima e quella di riserva dei testi non tradotti.', { a: '\u0001it-CH\u0001', b: '\u0001en-GB\u0001' }))}</p>
      </section>
      <div className="uf__actions"><button className="btn btn--primary" disabled={busy}>{busy ? t('Salvo…') : t('Salva')}</button></div>
    </form>
  );
}
