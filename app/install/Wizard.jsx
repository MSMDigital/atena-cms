'use client';

import { useRef, useState, useTransition } from 'react';
import { checkRequirementsAction, saveDatabaseAction, finishInstallAction } from './actions';

const STEPS = ['Chiave', 'Requisiti', 'Database', 'Admin', 'Template'];

const Fld = ({ label, error, help, children }) => (
  <label className="fld"><span className="fld__label">{label}</span>{children}{help && <span className="fld__help">{help}</span>}{error && <span className="fld__issues"><span className="bad" role="alert">{error}</span></span>}</label>
);

export default function Wizard() {
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
  const [tpl, setTpl] = useState({ id: '', siteUrl: '' });
  const [up, setUp] = useState(null);
  const fileRef = useRef(null);
  const [done, setDone] = useState(null);

  const go = (n) => { setErr({}); setMsg(null); setStep(n); };

  const unlock = () => start(async () => {
    const r = await checkRequirementsAction(token);
    if (!r.ok) { setMsg(r.error); return; }
    setInfo(r);
    setCfg((c) => ({ ...c, appOrigin: c.appOrigin || r.appOrigin || window.location.origin }));
    setTpl((t) => ({ ...t, id: t.id || r.templates.find((x) => x.active)?.id || r.templates[0]?.id || '', siteUrl: t.siteUrl || '' }));
    setDbDone(r.dbReady);
    go(1);
  });
  const recheck = () => start(async () => { const r = await checkRequirementsAction(token); if (r.ok) setInfo(r); });

  const saveDb = () => start(async () => {
    setErr({}); setMsg(null);
    const r = await saveDatabaseAction(token, db, cfg);
    if (r.ok) { setDbDone(true); go(3); return; }
    setErr(r.errors ?? {}); setMsg(r.error ?? 'Controlla i campi evidenziati.');
  });

  const uploadTpl = async (e) => {
    e.preventDefault();
    const f = fileRef.current?.files?.[0];
    if (!f) { setUp({ error: 'Scegli un file zip.' }); return; }
    const fd = new FormData(); fd.append('file', f);
    setUp({ busy: true });
    try {
      const res = await fetch('/install/template-upload', { method: 'POST', body: fd, headers: { 'x-install-token': token } }); const json = await res.json();
      if (json.ok) { const r = await checkRequirementsAction(token); if (r.ok) setInfo(r); setTpl((t) => ({ ...t, id: json.manifest.id })); setUp({ ok: `Installato: ${json.manifest.name} ${json.manifest.version}` }); }
      else setUp({ error: json.error, details: json.details });
    } catch { setUp({ error: 'Connessione non riuscita.' }); }
  };

  const finish = () => start(async () => {
    setErr({}); setMsg(null);
    const r = await finishInstallAction(token, { admin, templateId: tpl.id, siteUrl: tpl.siteUrl });
    if (r.ok) { setDone(r); return; }
    setErr(r.errors ?? {}); setMsg(r.error ?? 'Controlla i campi evidenziati.');
    if (r.errors && (r.errors.email || r.errors.name || r.errors.password || r.errors.again)) setStep(3);
  });

  if (done) {
    return (
      <div className="install__done">
        <h2>Installazione completata</h2>
        <p>Il primo admin è stato creato e il template è attivo.{done.published ? ' Il sito è già pubblicato.' : ''}</p>
        {!done.published && <p className="notice notice--warn">La pubblicazione del sito non è riuscita ({done.publishError}): potrai riprovare dall&apos;admin.</p>}
        <p><a className="btn btn--primary" href="/admin/login">Vai all&apos;accesso</a></p>
        <p className="hint">La pagina di installazione ora è chiusa e la chiave di installazione non serve più.</p>
      </div>
    );
  }

  return (
    <div className="install__wizard">
      <ol className="install__steps" aria-label="Passi">{STEPS.map((s, i) => <li key={s} className={i === step ? 'on' : i < step ? 'past' : ''}>{s}</li>)}</ol>
      {msg && <p className="notice notice--bad" role="alert">{msg}</p>}

      {step === 0 && (
        <section>
          <h2>Chiave di installazione</h2>
          <p>Per evitare che qualcun altro installi il CMS al posto tuo serve la chiave di installazione. La trovi nel <strong>log del server</strong> (riga «Chiave di installazione») e nel file <code>data/install-token</code>; oppure imposti tu la variabile <code>INSTALL_TOKEN</code>.</p>
          <Fld label="Chiave"><input name="token" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" spellCheck={false} autoFocus /></Fld>
          <button className="btn btn--primary" disabled={busy || !token} onClick={unlock}>{busy ? 'Controllo…' : 'Continua'}</button>
        </section>
      )}

      {step === 1 && info && (
        <section>
          <h2>Requisiti</h2>
          <ul className="install__reqs">{info.requirements.items.map((i) => <li key={i.name} className={i.ok ? 'ok' : 'bad'}><strong>{i.ok ? '✓' : '✗'}</strong> {i.name}{!i.ok && i.detail ? <span className="muted"> — {i.detail}</span> : null}</li>)}</ul>
          <div className="install__nav">
            <button className="btn" disabled={busy} onClick={recheck}>Ricontrolla</button>
            <button className="btn btn--primary" disabled={!info.requirements.ok} onClick={() => go(2)}>Continua</button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section>
          <h2>Database</h2>
          {info?.dbReady && <p className="notice notice--ok">C&apos;è già un database configurato e con le tabelle del CMS. Puoi usarlo così com&apos;è.</p>}
          <p className="hint">MySQL o MariaDB. Il database va creato prima (dal pannello del fornitore) e deve essere vuoto; l&apos;utente deve poter creare tabelle.</p>
          <div className="install__grid">
            <Fld label="Server" error={err.host}><input value={db.host} onChange={(e) => setDb({ ...db, host: e.target.value })} /></Fld>
            <Fld label="Porta" error={err.port}><input type="number" value={db.port} onChange={(e) => setDb({ ...db, port: e.target.value })} /></Fld>
            <Fld label="Nome del database" error={err.name}><input value={db.name} onChange={(e) => setDb({ ...db, name: e.target.value })} /></Fld>
            <Fld label="Utente" error={err.user}><input value={db.user} autoComplete="off" onChange={(e) => setDb({ ...db, user: e.target.value })} /></Fld>
            <Fld label="Password" error={err.password}><input type="password" value={db.password} autoComplete="new-password" onChange={(e) => setDb({ ...db, password: e.target.value })} /></Fld>
          </div>
          <Fld label="Indirizzo con cui si apre l'admin" error={err.appOrigin} help="Es. https://admin.esempio.ch: serve al controllo delle richieste (contro gli attacchi da altri siti) e ai cookie sicuri."><input value={cfg.appOrigin} onChange={(e) => setCfg({ ...cfg, appOrigin: e.target.value })} /></Fld>
          <label className="check"><input type="checkbox" checked={cfg.trustProxy} onChange={(e) => setCfg({ ...cfg, trustProxy: e.target.checked })} /> L&apos;app sta dietro un proxy (hosting condiviso, Infomaniak, nginx…): usa l&apos;indirizzo del visitatore che il proxy indica</label>
          <div className="install__nav">
            <button className="btn" onClick={() => go(1)}>Indietro</button>
            {info?.dbReady && <button className="btn" onClick={() => go(3)}>Usa il database già configurato</button>}
            <button className="btn btn--primary" disabled={busy} onClick={saveDb}>{busy ? 'Connessione e creazione delle tabelle…' : 'Prova e salva'}</button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section>
          <h2>Primo admin</h2>
          {dbDone && <p className="notice notice--ok">Database pronto.</p>}
          <div className="install__grid">
            <Fld label="Nome" error={err.name}><input value={admin.name} onChange={(e) => setAdmin({ ...admin, name: e.target.value })} /></Fld>
            <Fld label="Email (serve per accedere)" error={err.email}><input type="email" value={admin.email} onChange={(e) => setAdmin({ ...admin, email: e.target.value })} /></Fld>
            <Fld label="Password" error={err.password} help="Almeno 12 caratteri."><input type="password" value={admin.password} autoComplete="new-password" onChange={(e) => setAdmin({ ...admin, password: e.target.value })} /></Fld>
            <Fld label="Ripeti la password" error={err.again}><input type="password" value={admin.again} autoComplete="new-password" onChange={(e) => setAdmin({ ...admin, again: e.target.value })} /></Fld>
          </div>
          <div className="install__nav">
            <button className="btn" onClick={() => go(2)}>Indietro</button>
            <button className="btn btn--primary" onClick={() => go(4)}>Continua</button>
          </div>
        </section>
      )}

      {step === 4 && info && (
        <section>
          <h2>Template</h2>
          {info.templates.length === 0 && <p className="hint">Nessun template installato: carica un file zip qui sotto.</p>}
          <div className="install__tpls" role="radiogroup" aria-label="Template">
            {info.templates.map((t) => (
              <label key={t.id} className={`install__tpl${tpl.id === t.id ? ' on' : ''}`}>
                <input type="radio" name="tpl" checked={tpl.id === t.id} onChange={() => setTpl({ ...tpl, id: t.id })} />
                <span><strong>{t.name}</strong> <span className="muted">{t.id} · {t.version}</span><br /><span>{t.description}</span></span>
              </label>
            ))}
          </div>
          {err.template && <p className="bad" role="alert">{err.template}</p>}
          {info.uploadEnabled && <form onSubmit={uploadTpl} className="install__upload">
            <Fld label="Oppure carica un template (.zip)"><input ref={fileRef} type="file" accept=".zip,application/zip" /></Fld>
            <button className="btn" disabled={up?.busy}>{up?.busy ? 'Controllo e prova…' : 'Carica'}</button>
            {up?.ok && <p className="ok" role="status">{up.ok}</p>}
            {up?.error && <div className="bad" role="alert">{up.error}{up.details?.length ? <ul>{up.details.slice(0, 6).map((d, i) => <li key={i}>{d}</li>)}</ul> : null}</div>}
          </form>}
          <Fld label="Indirizzo pubblico del sito" error={err.siteUrl} help="Es. https://www.esempio.ch (senza barra finale): è la base di canonical, mappa del sito e dati strutturati. Si può cambiare dopo, in Sito."><input value={tpl.siteUrl} onChange={(e) => setTpl({ ...tpl, siteUrl: e.target.value })} placeholder="https://www.esempio.ch" /></Fld>
          <p className="hint">Si installano i contenuti di esempio del template e il sito viene pubblicato subito: poi li modifichi dall&apos;admin.</p>
          <div className="install__nav">
            <button className="btn" onClick={() => go(3)}>Indietro</button>
            <button className="btn btn--primary" disabled={busy || !tpl.id || !tpl.siteUrl} onClick={finish}>{busy ? 'Installazione…' : 'Installa'}</button>
          </div>
        </section>
      )}
    </div>
  );
}
