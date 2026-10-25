'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { formatStamp } from '@/render/format.mjs';
import { useT } from '@/app/admin/_i18n/I18nProvider';
import { createBackupAction, deleteBackupAction, restoreBackupAction } from './actions';

const size = (b) => (b >= 1073741824 ? `${(b / 1073741824).toFixed(2)} GB` : b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

// Le parti tra \u0001 … \u0001 vanno in <code>.
const code = (text) => text.split('\u0001').map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part));

export default function BackupPanel({ backups, uploads, general, maxMb }) {
  const t = useT();
  const router = useRouter();
  const [opts, setOpts] = useState({ includeSite: true, includeSecrets: false });
  const [msg, setMsg] = useState(null);
  const [busy, start] = useTransition();
  const [up, setUp] = useState(null);
  const [asking, setAsking] = useState(null);   // { source, name }
  const [conf, setConf] = useState({ password: '', phrase: '' });
  const [done, setDone] = useState(null);
  const file = useRef(null);

  const create = () => start(async () => {
    setMsg(null);
    const r = await createBackupAction(opts);
    if (r.ok) { setMsg({ tone: 'ok', text: t('Backup creato: {name} ({size}).', { name: r.name, size: size(r.size) }) }); router.refresh(); } else setMsg({ tone: 'bad', text: r.error });
  });
  const remove = (name) => {
    if (!window.confirm(t('Eliminare {name}? Non si può annullare.', { name }))) return;
    start(async () => { const r = await deleteBackupAction(name); setMsg(r.ok ? { tone: 'ok', text: t('Backup eliminato.') } : { tone: 'bad', text: r.error }); router.refresh(); });
  };
  const upload = async (e) => {
    e.preventDefault();
    const f = file.current?.files?.[0];
    if (!f) { setUp({ error: t('Scegli un file .zip.') }); return; }
    setUp({ busy: true });
    try {
      const res = await fetch('/admin/backup/upload', { method: 'POST', body: f, headers: { 'x-filename': encodeURIComponent(f.name), 'content-type': 'application/zip' } });
      const j = await res.json().catch(() => ({}));
      if (j.ok) { setUp({ ok: t("Caricato: {name} ({size}). Ora puoi ripristinarlo dall'elenco qui sotto.", { name: j.name, size: size(j.size) }) }); file.current.value = ''; router.refresh(); } else setUp({ error: j.error ?? t('Caricamento non riuscito.') });
    } catch { setUp({ error: t('Connessione non riuscita.') }); }
  };
  const restore = (e) => {
    e.preventDefault();
    start(async () => {
      const r = await restoreBackupAction({ ...asking, ...conf });
      if (r.ok) setDone(r); else setMsg({ tone: 'bad', text: r.error });
    });
  };

  if (done) {
    return (
      <section className="card">
        <h2>{t('Ripristino completato')}</h2>
        <p>{t("Il sito è tornato com'era il {when}. Le sessioni sono state azzerate: accedi con le credenziali del backup.", { when: formatStamp(done.created, general) })}</p>
        {done.safety && <p className="hint">{code(t('Lo stato precedente al ripristino è salvato nel pacchetto {x}, che trovi in Impostazioni → Backup.', { x: '\u0001' + done.safety + '\u0001' }))}</p>}
        {done.secretsReset && <p className="notice notice--warn">{t('Le password email salvate non si possono leggere con questo server: reinseriscile in Impostazioni → Email.')}</p>}
        <p><a className="btn btn--primary" href="/admin/login">{t("Vai all'accesso")}</a></p>
      </section>
    );
  }

  const row = (b, source) => (
    <tr key={`${source}:${b.name}`}>
      <td><strong>{b.name}</strong>{source === 'upload' && !b.valid && <span className="muted"> — {t('non è un backup valido')}</span>}</td>
      <td className="muted">{b.createdAt ? formatStamp(b.createdAt, general) : '—'}</td>
      <td className="muted">{size(b.size)}</td>
      <td className="muted">{b.createdAt ? [b.template && t('template {name}', { name: b.template }), t('{n} immagini', { n: b.media }), b.includesSite ? t('sito pubblicato') : t('senza sito'), b.includesSecrets ? t('con chiave email') : null].filter(Boolean).join(' · ') : ''}</td>
      <td className="muted">
        {source === 'package' && <a href={`/admin/backup/download/${b.name}`} download>{t('Scarica')}</a>}
        {(source === 'package' || b.valid) && <> <button type="button" className="link" disabled={busy} onClick={() => { setAsking({ source, name: b.name }); setConf({ password: '', phrase: '' }); setMsg(null); }}>{t('Ripristina…')}</button></>}
        {source === 'package' && <> <button type="button" className="link link--danger" disabled={busy} onClick={() => remove(b.name)}>{t('Elimina')}</button></>}
      </td>
    </tr>
  );

  return (
    <div className="backup">
      {msg && <p className={`notice notice--${msg.tone}`} role="status">{msg.text}</p>}

      <section className="card uf__sec">
        <h2>{t('Crea un backup')}</h2>
        <label className="check"><input type="checkbox" checked={opts.includeSite} onChange={(e) => setOpts({ ...opts, includeSite: e.target.checked })} /> {t('Includi il sito pubblicato (così dopo il ripristino è subito online; altrimenti si rigenera con «Pubblica»)')}</label>
        <label className="check"><input type="checkbox" checked={opts.includeSecrets} onChange={(e) => setOpts({ ...opts, includeSecrets: e.target.checked })} /> {t('Includi la chiave che cifra le password email salvate')}</label>
        <p className="fld__help">{t('Contiene gli utenti (con le password cifrate), le richieste dei moduli, le immagini e i contenuti: tienilo al sicuro. Non contiene il codice del CMS né il file .env. Senza la chiave, dopo un ripristino su un altro server le password email salvate vanno reinserite; con la chiave, chiunque abbia il pacchetto potrebbe leggerle.')}</p>
        <div className="uf__actions" style={{ padding: 0 }}><button type="button" className="btn btn--primary" disabled={busy} onClick={create}>{busy && !asking ? t('Creazione…') : t('Crea backup')}</button></div>
      </section>

      <section className="card">
        <h2>{t('Backup creati qui')}</h2>
        <table className="table table--posts">
          <thead><tr><th>{t('Pacchetto')}</th><th>{t('Creato')}</th><th>{t('Dimensione')}</th><th>{t('Contenuto')}</th><th /></tr></thead>
          <tbody>{backups.length === 0 ? <tr><td colSpan={5} className="muted">{t('Nessun backup: creane uno qui sopra.')}</td></tr> : backups.map((b) => row(b, 'package'))}</tbody>
        </table>
      </section>

      <section className="card uf__sec">
        <h2>{t('Ripristina da un backup')}</h2>
        <p className="fld__help">{code(t("Il ripristino SOSTITUISCE database, immagini e sito con quelli del pacchetto. Prima si salva da solo lo stato attuale. Puoi caricare qui un pacchetto (massimo {max} MB), oppure copiarlo via FTP nella cartella {x} del server: compare nell'elenco.", { max: maxMb, x: '\u0001data/restore/\u0001' }))}</p>
        <form onSubmit={upload} className="mailset__actions">
          <input ref={file} type="file" accept=".zip,application/zip" aria-label={t('Pacchetto di backup')} />
          <button className="btn" disabled={up?.busy}>{up?.busy ? t('Caricamento…') : t('Carica')}</button>
        </form>
        {up?.ok && <p className="ok" role="status">{up.ok}</p>}
        {up?.error && <p className="bad" role="alert">{up.error}</p>}
        {uploads.length > 0 && (
          <table className="table table--posts">
            <thead><tr><th>{t('Pacchetto caricato')}</th><th>{t('Creato')}</th><th>{t('Dimensione')}</th><th>{t('Contenuto')}</th><th /></tr></thead>
            <tbody>{uploads.map((b) => row(b, 'upload'))}</tbody>
          </table>
        )}
      </section>

      {asking && (
        <section className="card uf__sec" role="alertdialog" aria-label={t('Conferma il ripristino')}>
          <h2>{t('Ripristinare «{name}»?', { name: asking.name })}</h2>
          <p className="notice notice--warn">{t('Database, immagini e sito saranno sostituiti con quelli del pacchetto. Verrai disconnesso e dovrai accedere con le credenziali del backup. Lo stato attuale si salva prima in un backup di sicurezza.')}</p>
          <form onSubmit={restore} className="uf__grid">
            <label className="uf__field"><span className="uf__label">{t('La tua password')}</span><input type="password" value={conf.password} autoComplete="current-password" onChange={(e) => setConf({ ...conf, password: e.target.value })} required /></label>
            <label className="uf__field"><span className="uf__label">{t('Scrivi RIPRISTINA per confermare')}</span><input value={conf.phrase} onChange={(e) => setConf({ ...conf, phrase: e.target.value })} autoComplete="off" required /></label>
            <div className="uf__actions" style={{ padding: 0 }}>
              <button className="btn btn--danger" disabled={busy || conf.phrase !== 'RIPRISTINA' || !conf.password}>{busy ? t('Ripristino in corso…') : t('Ripristina ora')}</button>
              <button type="button" className="btn" disabled={busy} onClick={() => setAsking(null)}>{t('Annulla')}</button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
