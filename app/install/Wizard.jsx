'use client';

import { Suspense, startTransition, useEffect, useRef, useState, useTransition } from 'react';
import { I18nProvider, useT, useLang } from '@/app/admin/_i18n/I18nProvider';
import { checkRequirementsAction, saveDatabaseAction, finishInstallAction, restoreInstallAction } from './actions';

const STEPS = ['Chiave', 'Requisiti', 'Database', 'Admin', 'Impostazioni', 'Template'];
const SITE_LANGS = [['it', 'Italiano'], ['en', 'English'], ['de', 'Deutsch'], ['fr', 'Français']];
const DATE_SAMPLE = [['', 'Predefinita (3 novembre 2026)'], ['DD.MM.YYYY', '03.11.2026'], ['DD/MM/YYYY', '03/11/2026'], ['MM/DD/YYYY', '11/03/2026'], ['YYYY-MM-DD', '2026-11-03'], ['D MMMM YYYY', '3 novembre 2026']];
const zones = () => { try { return Intl.supportedValuesOf('timeZone'); } catch { return ['Europe/Zurich', 'Europe/Rome', 'UTC']; } };
const localZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Zurich'; } catch { return 'Europe/Zurich'; } };

const Fld = ({ label, error, help, children }) => (
  <label className="fld"><span className="fld__label">{label}</span>{children}{help && <span className="fld__help">{help}</span>}{error && <span className="fld__issues"><span className="bad" role="alert">{error}</span></span>}</label>
);

// Sostituisce i segnaposto {nome} di una frase tradotta con elementi React (per testi con <code>, <strong>).
const rich = (t, text, parts) => t(text, Object.fromEntries(Object.keys(parts).map((k) => [k, `{{${k}}}`]))).split(/\{\{(\w+)\}\}/).map((p, i) => (i % 2 ? <span key={i}>{parts[p]}</span> : p));

// La lingua qui non si legge dalle impostazioni (il database può non esserci): italiano sul server, inglese se il browser è in inglese.
export default function Wizard() {
  const [lang, setLang] = useState('it');
  useEffect(() => { if (/^en/i.test(navigator.language || '')) startTransition(() => setLang('en')); }, []);
  return (
    <Suspense fallback={null}>
      <I18nProvider lang={lang}>
        <div className="install__lang" style={{ textAlign: 'right' }}>
          <select value={lang} onChange={(e) => startTransition(() => setLang(e.target.value))} aria-label="Lingua / Language">
            <option value="it">Italiano</option>
            <option value="en">English</option>
          </select>
        </div>
        <Title />
        <WizardInner />
      </I18nProvider>
    </Suspense>
  );
}

function Title() {
  const t = useT();
  useEffect(() => { document.title = `${t('Installazione')} | Atena CMS`; }, [t]);   // il titolo della scheda segue la lingua scelta nel wizard
  return <h1>{t('Installazione di Atena')}</h1>;
}

function WizardInner() {
  const t = useT();
  const lang = useLang();
  const [step, setStep] = useState(0);
  const [token, setToken] = useState('');
  const [info, setInfo] = useState(null);           // requisiti, database pronto, template disponibili
  const [err, setErr] = useState({});
  const [msg, setMsg] = useState(null);
  const [busy, start] = useTransition();
  const [db, setDb] = useState({ host: '127.0.0.1', port: 3306, name: '', user: '', password: '' });
  const [cfg, setCfg] = useState({ appOrigin: '', trustProxy: true });
  const [dbDone, setDbDone] = useState(false);
  const [admin, setAdmin] = useState({ name: '', email: '', password: '', again: '' });
  const [prefs, setPrefs] = useState({ siteLanguage: 'it', cmsLanguage: 'it', timezone: 'Europe/Zurich', adminEmail: '', dateFormat: '', timeFormat: '24h', weekStart: 1 });
  const [tpl, setTpl] = useState({ id: '', siteUrl: '' });
  const [up, setUp] = useState(null);
  const fileRef = useRef(null);
  const [done, setDone] = useState(null);
  const [rest, setRest] = useState(null);          // ripristino da backup: { busy, error, ok }
  const restFile = useRef(null);

  const go = (n) => { setErr({}); setMsg(null); setStep(n); };

  const unlock = () => start(async () => {
    const r = await checkRequirementsAction(token, lang);
    if (!r.ok) { setMsg(r.error); return; }
    setInfo(r);
    setCfg((c) => ({ ...c, appOrigin: c.appOrigin || r.appOrigin || window.location.origin }));
    setTpl((p) => ({ ...p, id: p.id || r.templates.find((x) => x.id === 'starter')?.id || r.templates.find((x) => x.active)?.id || r.templates[0]?.id || '', siteUrl: p.siteUrl || '' }));
    setDbDone(r.dbReady);
    go(1);
  });
  const recheck = () => start(async () => { const r = await checkRequirementsAction(token, lang); if (r.ok) setInfo(r); });

  const saveDb = () => start(async () => {
    setErr({}); setMsg(null);
    const r = await saveDatabaseAction(token, db, cfg, lang);
    if (r.ok) { setDbDone(true); go(3); return; }
    setErr(r.errors ?? {}); setMsg(r.error ?? t('Controlla i campi evidenziati.'));
  });

  const uploadTpl = async (e) => {
    e.preventDefault();
    const f = fileRef.current?.files?.[0];
    if (!f) { setUp({ error: t('Scegli un file zip.') }); return; }
    const fd = new FormData(); fd.append('file', f);
    setUp({ busy: true });
    try {
      const res = await fetch('/install/template-upload', { method: 'POST', body: fd, headers: { 'x-install-token': token, 'x-lang': lang } }); const json = await res.json();
      if (json.ok) { const r = await checkRequirementsAction(token, lang); if (r.ok) setInfo(r); setTpl((p) => ({ ...p, id: json.manifest.id })); setUp({ ok: t('Installato: {name} {version}', { name: json.manifest.name, version: json.manifest.version }) }); }
      else setUp({ error: json.error, details: json.details });
    } catch { setUp({ error: t('Connessione non riuscita.') }); }
  };

  const uploadBackup = async (e) => {
    e.preventDefault();
    const f = restFile.current?.files?.[0];
    if (!f) { setRest({ error: t('Scegli un file .zip.') }); return; }
    setRest({ busy: true });
    try {
      const res = await fetch('/install/restore-upload', { method: 'POST', body: f, headers: { 'x-install-token': token, 'x-lang': lang, 'x-filename': encodeURIComponent(f.name), 'content-type': 'application/zip' } });
      const j = await res.json().catch(() => ({}));
      if (j.ok) { const r = await checkRequirementsAction(token, lang); if (r.ok) setInfo(r); restFile.current.value = ''; setRest({ ok: t('Caricato: {name}. Scegli «Ripristina» qui sotto.', { name: j.name }) }); } else setRest({ error: j.error ?? t('Caricamento non riuscito.') });
    } catch { setRest({ error: t('Connessione non riuscita.') }); }
  };
  const restoreFrom = (name) => {
    if (!window.confirm(t('Ripristinare «{name}»? Il database di questo sito verrà sostituito con quello del pacchetto.', { name }))) return;
    setRest({ busy: true });
    start(async () => {
      const r = await restoreInstallAction(token, name, lang);
      if (r.ok) setDone({ restored: true, secretsReset: r.secretsReset, published: true });
      else setRest({ error: r.error });
    });
  };

  const finish = () => start(async () => {
    setErr({}); setMsg(null);
    const r = await finishInstallAction(token, { admin, templateId: tpl.id, siteUrl: tpl.siteUrl, settings: { ...prefs, weekStart: Number(prefs.weekStart) } }, lang);
    if (r.ok) { setDone(r); return; }
    setErr(r.errors ?? {}); setMsg(r.error ?? t('Controlla i campi evidenziati.'));
    if (r.errors && (r.errors.email || r.errors.name || r.errors.password || r.errors.again)) setStep(3);
    else if (r.errors && (r.errors.adminEmail || r.errors.timezone || r.errors.dateFormat || r.errors.timeFormat || r.errors.weekStart || r.errors.cmsLanguage || r.errors.siteLanguage)) setStep(4);
  });

  if (done?.restored) {
    return (
      <div className="install__done">
        <h2>{t('Ripristino completato')}</h2>
        <p>{t('Database, immagini e sito sono stati ripristinati dal backup. Accedi con le credenziali del sito originale.')}</p>
        {done.secretsReset && <p className="notice notice--warn">{t('Le password email salvate non si possono leggere su questo server: reinseriscile in Impostazioni → Email.')}</p>}
        <p><a className="btn btn--primary" href="/admin/login">{t("Vai all'accesso")}</a></p>
        <p className="hint">{t('La pagina di installazione ora è chiusa e la chiave di installazione non serve più.')}</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="install__done">
        <h2>{t('Installazione completata')}</h2>
        <p>{t('Il primo admin è stato creato e il template è attivo.')}{done.published ? t(' Il sito è già pubblicato.') : ''}</p>
        {!done.published && <p className="notice notice--warn">{t("La pubblicazione del sito non è riuscita ({error}): potrai riprovare dall'admin.", { error: done.publishError })}</p>}
        <p><a className="btn btn--primary" href="/admin/login">{t("Vai all'accesso")}</a></p>
        <p className="hint">{t('La pagina di installazione ora è chiusa e la chiave di installazione non serve più.')}</p>
      </div>
    );
  }

  return (
    <div className="install__wizard">
      <ol className="install__steps" aria-label={t('Passi')}>{STEPS.map((s, i) => <li key={s} className={i === step ? 'on' : i < step ? 'past' : ''}>{t(s)}</li>)}</ol>
      {msg && <p className="notice notice--bad" role="alert">{msg}</p>}

      {step === 0 && (
        <section>
          <h2>{t('Chiave di installazione')}</h2>
          <p>{rich(t, 'Per evitare che qualcun altro installi il CMS al posto tuo serve la chiave di installazione. La trovi nel {log} (riga «Chiave di installazione») e nel file {file}; oppure imposti tu la variabile {var}.', { log: <strong>{t('log del server')}</strong>, file: <code>data/install-token</code>, var: <code>INSTALL_TOKEN</code> })}</p>
          <Fld label={t('Chiave')}><input name="token" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" spellCheck={false} autoFocus /></Fld>
          <button className="btn btn--primary" disabled={busy || !token} onClick={unlock}>{busy ? t('Controllo…') : t('Continua')}</button>
        </section>
      )}

      {step === 1 && info && (
        <section>
          <h2>{t('Requisiti')}</h2>
          <ul className="install__reqs">{info.requirements.items.map((i) => <li key={i.name} className={i.ok ? 'ok' : 'bad'}><strong>{i.ok ? '✓' : '✗'}</strong> {t(i.name)}{!i.ok && i.detail ? <span className="muted"> — {i.detail.startsWith('in uso: ') ? t('in uso: {v}', { v: i.detail.slice(8) }) : t(i.detail)}</span> : null}</li>)}</ul>
          <div className="install__nav">
            <button className="btn" disabled={busy} onClick={recheck}>{t('Ricontrolla')}</button>
            <button className="btn btn--primary" disabled={!info.requirements.ok} onClick={() => go(2)}>{t('Continua')}</button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section>
          <h2>{t('Database')}</h2>
          {info?.dbReady && <p className="notice notice--ok">{t("C'è già un database configurato e con le tabelle del CMS. Puoi usarlo così com'è.")}</p>}
          <p className="hint">{t("MySQL o MariaDB. Il database va creato prima (dal pannello del fornitore) e deve essere vuoto; l'utente deve poter creare tabelle.")}</p>
          <div className="install__grid">
            <Fld label={t('Server')} error={err.host}><input value={db.host} onChange={(e) => setDb({ ...db, host: e.target.value })} /></Fld>
            <Fld label={t('Porta')} error={err.port}><input type="number" value={db.port} onChange={(e) => setDb({ ...db, port: e.target.value })} /></Fld>
            <Fld label={t('Nome del database')} error={err.name}><input value={db.name} onChange={(e) => setDb({ ...db, name: e.target.value })} /></Fld>
            <Fld label={t('Utente')} error={err.user}><input value={db.user} autoComplete="off" onChange={(e) => setDb({ ...db, user: e.target.value })} /></Fld>
            <Fld label={t('Password')} error={err.password}><input type="password" value={db.password} autoComplete="new-password" onChange={(e) => setDb({ ...db, password: e.target.value })} /></Fld>
          </div>
          <Fld label={t("Indirizzo con cui si apre l'admin")} error={err.appOrigin} help={t('Es. https://admin.esempio.ch: serve al controllo delle richieste (contro gli attacchi da altri siti) e ai cookie sicuri.')}><input value={cfg.appOrigin} onChange={(e) => setCfg({ ...cfg, appOrigin: e.target.value })} /></Fld>
          <label className="check"><input type="checkbox" checked={cfg.trustProxy} onChange={(e) => setCfg({ ...cfg, trustProxy: e.target.checked })} /> {t("L'app sta dietro un proxy (hosting condiviso, Infomaniak, nginx…): usa l'indirizzo del visitatore che il proxy indica")}</label>
          <div className="install__nav">
            <button className="btn" onClick={() => go(1)}>{t('Indietro')}</button>
            {info?.dbReady && <button className="btn" onClick={() => go(3)}>{t('Usa il database già configurato')}</button>}
            <button className="btn btn--primary" disabled={busy} onClick={saveDb}>{busy ? t('Connessione e creazione delle tabelle…') : t('Prova e salva')}</button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section>
          <h2>{t('Primo admin')}</h2>
          {dbDone && <p className="notice notice--ok">{t('Database pronto.')}</p>}
          <div className="install__grid">
            <Fld label={t('Nome')} error={err.name}><input value={admin.name} onChange={(e) => setAdmin({ ...admin, name: e.target.value })} /></Fld>
            <Fld label={t('Email (serve per accedere)')} error={err.email}><input type="email" value={admin.email} onChange={(e) => setAdmin({ ...admin, email: e.target.value })} /></Fld>
            <Fld label={t('Password')} error={err.password} help={t('Almeno 12 caratteri.')}><input type="password" value={admin.password} autoComplete="new-password" onChange={(e) => setAdmin({ ...admin, password: e.target.value })} /></Fld>
            <Fld label={t('Ripeti la password')} error={err.again}><input type="password" value={admin.again} autoComplete="new-password" onChange={(e) => setAdmin({ ...admin, again: e.target.value })} /></Fld>
          </div>
          <details className="install__restore">
            <summary>{t('Hai un backup di Atena? Ripristina il sito invece di crearne uno nuovo')}</summary>
            <p className="hint">{rich(t, 'Carica qui il pacchetto (.zip) scaricato da Impostazioni → Backup, oppure copialo via FTP nella cartella {dir} del server. Il ripristino sostituisce il database e porta con sé utenti, contenuti, immagini e sito pubblicato.', { dir: <code>data/restore/</code> })}</p>
            <form onSubmit={uploadBackup} className="install__upload">
              <input ref={restFile} type="file" accept=".zip,application/zip" aria-label={t('Pacchetto di backup')} />
              <button className="btn" disabled={rest?.busy}>{rest?.busy ? t('Un attimo…') : t('Carica')}</button>
            </form>
            {rest?.ok && <p className="ok" role="status">{rest.ok}</p>}
            {rest?.error && <p className="bad" role="alert">{rest.error}</p>}
            {info?.restoreFiles?.length > 0 && (
              <ul className="plain">{info.restoreFiles.map((b) => <li key={b.name}><strong>{b.name}</strong>{b.valid ? <span className="muted"> — {b.media === 1 ? t('{mb} MB, 1 immagine', { mb: Math.max(1, Math.round(b.size / 1048576)) }) : t('{mb} MB, {n} immagini', { mb: Math.max(1, Math.round(b.size / 1048576)), n: b.media })}{b.includesSite ? t(', sito pubblicato') : ''}</span> : <span className="bad"> — {t('non è un backup valido')}</span>} {b.valid && <button type="button" className="btn" disabled={busy || rest?.busy} onClick={() => restoreFrom(b.name)}>{t('Ripristina')}</button>}</li>)}</ul>
            )}
          </details>
          <div className="install__nav">
            <button className="btn" onClick={() => go(2)}>{t('Indietro')}</button>
            <button className="btn btn--primary" onClick={() => { setPrefs((p) => ({ ...p, adminEmail: p.adminEmail || admin.email, timezone: p.timezone === 'Europe/Zurich' && localZone() !== 'Europe/Zurich' ? localZone() : p.timezone })); go(4); }}>{t('Continua')}</button>
          </div>
        </section>
      )}

      {step === 4 && (
        <section>
          <h2>{t('Impostazioni generali')}</h2>
          <p className="hint">{t('Si possono cambiare in qualsiasi momento da Impostazioni → Generale e Lingue.')}</p>
          <div className="install__grid">
            <Fld label={t('Lingua del sito')} error={err.siteLanguage} help={t('La lingua predefinita. I contenuti di esempio dei template sono in italiano: le altre lingue si aggiungono dopo da Impostazioni → Lingue.')}><select value={prefs.siteLanguage} onChange={(e) => setPrefs({ ...prefs, siteLanguage: e.target.value })}>{SITE_LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Fld>
            <Fld label={t('Lingua del CMS')} error={err.cmsLanguage} help={t("Cambia i testi dell'admin. Puoi cambiarla dopo in Impostazioni → Generale.")}><select value={prefs.cmsLanguage} onChange={(e) => setPrefs({ ...prefs, cmsLanguage: e.target.value })}><option value="it">Italiano</option><option value="en">{t('English')}</option></select></Fld>
            <Fld label={t("Email dell'amministrazione")} error={err.adminEmail} help={t('Riceve le notifiche del CMS e, di default, le richieste dei moduli.')}><input type="email" value={prefs.adminEmail} onChange={(e) => setPrefs({ ...prefs, adminEmail: e.target.value })} /></Fld>
            <Fld label={t('Fuso orario')} error={err.timezone}><select value={prefs.timezone} onChange={(e) => setPrefs({ ...prefs, timezone: e.target.value })}>{zones().map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}</select></Fld>
            <Fld label={t('Formato della data')} error={err.dateFormat}><select value={prefs.dateFormat} onChange={(e) => setPrefs({ ...prefs, dateFormat: e.target.value })}>{DATE_SAMPLE.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}</select></Fld>
            <Fld label={t("Formato dell'ora")} error={err.timeFormat}><select value={prefs.timeFormat} onChange={(e) => setPrefs({ ...prefs, timeFormat: e.target.value })}><option value="24h">{t('24 ore (14:30)')}</option><option value="12h">{t('12 ore (2:30 PM)')}</option></select></Fld>
            <Fld label={t('Primo giorno della settimana')} error={err.weekStart}><select value={prefs.weekStart} onChange={(e) => setPrefs({ ...prefs, weekStart: e.target.value })}><option value={1}>{t('Lunedì')}</option><option value={6}>{t('Sabato')}</option><option value={0}>{t('Domenica')}</option></select></Fld>
          </div>
          <div className="install__nav">
            <button className="btn" onClick={() => go(3)}>{t('Indietro')}</button>
            <button className="btn btn--primary" onClick={() => go(5)}>{t('Continua')}</button>
          </div>
        </section>
      )}

      {step === 5 && info && (
        <section>
          <h2>{t('Template')}</h2>
          {info.templates.length === 0 && <p className="hint">{t('Nessun template installato: carica un file zip qui sotto.')}</p>}
          <div className="install__tpls" role="radiogroup" aria-label={t('Template')}>
            {info.templates.map((x) => (
              <label key={x.id} className={`install__tpl${tpl.id === x.id ? ' on' : ''}`}>
                <input type="radio" name="tpl" checked={tpl.id === x.id} onChange={() => setTpl({ ...tpl, id: x.id })} />
                <span><strong>{x.name}</strong> <span className="muted">{x.id} · {x.version}</span><br /><span>{x.description}</span></span>
              </label>
            ))}
          </div>
          {err.template && <p className="bad" role="alert">{err.template}</p>}
          {info.uploadEnabled && <form onSubmit={uploadTpl} className="install__upload">
            <Fld label={t('Oppure carica un template (.zip)')}><input ref={fileRef} type="file" accept=".zip,application/zip" /></Fld>
            <button className="btn" disabled={up?.busy}>{up?.busy ? t('Controllo e prova…') : t('Carica')}</button>
            {up?.ok && <p className="ok" role="status">{up.ok}</p>}
            {up?.error && <div className="bad" role="alert">{up.error}{up.details?.length ? <ul>{up.details.slice(0, 6).map((d, i) => <li key={i}>{d}</li>)}</ul> : null}</div>}
          </form>}
          <Fld label={t('Indirizzo pubblico del sito')} error={err.siteUrl} help={t('Es. https://www.esempio.ch (senza barra finale): è la base di canonical, mappa del sito e dati strutturati. Si può cambiare dopo, in Sito.')}><input value={tpl.siteUrl} onChange={(e) => setTpl({ ...tpl, siteUrl: e.target.value })} placeholder="https://www.esempio.ch" /></Fld>
          <p className="hint">{t("Si installano i contenuti di esempio del template e il sito viene pubblicato subito: poi li modifichi dall'admin.")}</p>
          <div className="install__nav">
            <button className="btn" onClick={() => go(4)}>{t('Indietro')}</button>
            <button className="btn btn--primary" disabled={busy || !tpl.id || !tpl.siteUrl} onClick={finish}>{busy ? t('Installazione…') : t('Installa')}</button>
          </div>
        </section>
      )}
    </div>
  );
}
