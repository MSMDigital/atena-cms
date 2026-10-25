'use client';

import { useState, useTransition } from 'react';
import { useT } from '@/app/admin/_i18n/I18nProvider';
import { saveAdminPathAction, clearAdminPathAction, suggestAdminPathAction } from './actions';

// Le parti tra \u0001 … \u0001 vanno in <code>.
const code = (text) => text.split('\u0001').map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part));

export default function AdminPathSettings({ initial }) {
  const t = useT();
  const [view, setView] = useState(initial);
  const [value, setValue] = useState(initial.slug ?? '');
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);
  const [copied, setCopied] = useState(false);
  const [busy, start] = useTransition();
  const full = (slug) => `${view.origin}/${slug}/login`;
  const preview = value.trim() ? full(value.trim().toLowerCase()) : null;

  const save = (e) => {
    e.preventDefault(); setError(null); setMsg(null);
    start(async () => {
      const r = await saveAdminPathAction(value);
      if (r.ok) { setView({ slug: r.slug, origin: r.origin }); setValue(r.slug); setMsg(t('Salvato. Da ora l\'accesso è solo a questo indirizzo: salvalo nei preferiti.')); }
      else setError(r.error);
    });
  };
  const off = () => start(async () => {
    const r = await clearAdminPathAction();
    setView({ slug: r.slug, origin: r.origin }); setValue(''); setError(null); setMsg(t('Indirizzo personalizzato rimosso: l\'accesso torna a /admin/login.'));
  });
  const suggest = () => start(async () => { const r = await suggestAdminPathAction(); setValue(r.slug); setError(null); setMsg(null); });
  const copy = async (text) => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard non disponibile */ } };

  return (
    <>
      <div className={`notice ${view.slug ? 'notice--ok' : 'notice--bad'}`}>
        {view.slug
          ? <p>{t("Attivo. L'accesso è a")} <strong>{full(view.slug)}</strong> <button type="button" className="link" onClick={() => copy(full(view.slug))}>{copied ? t('Copiato') : t('Copia')}</button></p>
          : <p>{code(t("Non attivo: l'accesso è all'indirizzo di serie {a}, noto a tutti.", { a: '\u0001/admin/login\u0001' }))}</p>}
      </div>
      <form className="card" onSubmit={save}>
        <label className="fld" data-path="slug">
          <span className="fld__label">{t('Indirizzo di accesso')}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexWrap: 'wrap' }}>
            <code>{view.origin}/</code>
            <input style={{ flex: '1 1 14rem' }} value={value} onChange={(e) => { setValue(e.target.value); setError(null); setMsg(null); }} spellCheck={false} autoComplete="off" autoCapitalize="none" placeholder="entrata-privata" aria-invalid={!!error} />
            <code>/login</code>
          </span>
          <span className="fld__help">{t('Da 3 a 40 caratteri: lettere minuscole, cifre e trattini. Meglio un indirizzo lungo e non indovinabile: usa «Genera» per averne uno casuale.')}</span>
          {error && <span className="fld__issues"><span className="bad" role="alert">{error}</span></span>}
        </label>
        {preview && <p className="hint">{t("L'accesso sarà:")} <strong>{preview}</strong></p>}
        <div className="editor__actions" style={{ marginTop: '1rem' }}>
          <button className="btn btn--primary" disabled={busy || !value.trim()}>{t('Salva')}</button>
          <button type="button" className="btn" onClick={suggest} disabled={busy}>{t('Genera')}</button>
          {view.slug && <button type="button" className="btn btn--danger" onClick={off} disabled={busy}>{t('Torna a /admin/login')}</button>}
        </div>
        {msg && <p className="notice notice--ok" role="status">{msg}</p>}
      </form>
      <div className="card">
        <h2>{t('Cosa cambia, cosa sapere')}</h2>
        <ul>
          <li>{t('Le sessioni già aperte restano valide: dopo aver salvato non devi riaccedere.')}</li>
          <li>{code(t('Chi non è autenticato e apre {a} o {b} vede «non trovato»: la pagina di accesso non si scopre più per tentativi.', { a: '\u0001/admin\u0001', b: '\u0001/admin/login\u0001' }))}</li>
          <li>{code(t("Se perdi l'indirizzo: dal server esegui {a} per leggerlo, o {b} per tornare a {c}.", { a: '\u0001npm run admin:path -- --show\u0001', b: '\u0001npm run admin:path -- --reset\u0001', c: '\u0001/admin/login\u0001' }))}</li>
          <li>{t('Questo nasconde la porta, non sostituisce la password: restano attivi il blocco dopo i tentativi falliti e le password robuste.')}</li>
        </ul>
      </div>
    </>
  );
}
