'use client';

import { useState, useTransition } from 'react';
import { saveMailSettingsAction, deleteMailSettingsAction, sendTestMailAction } from './actions';

const PORTS = { starttls: 587, ssl: 465, none: 25 };
const SECURITY = [
  ['starttls', 'STARTTLS (porta 587): la scelta più comune'],
  ['ssl', 'SSL/TLS diretto (porta 465)'],
  ['none', 'Nessuna cifratura (solo per prove in locale)'],
];
const SOURCE = {
  database: ['ok', 'In uso: le impostazioni salvate qui.'],
  env: ['warn', 'In uso: le variabili del file .env del server. Salvando qui, le impostazioni di questa pagina hanno la precedenza.'],
  none: ['bad', 'Nessun server email configurato: le richieste si salvano ma le email non partono.'],
};

const blank = (view) => {
  const s = view.settings;
  return { host: s?.host ?? '', port: s?.port ?? 587, security: s?.security ?? 'starttls', user: s?.user ?? '', password: '', clearPassword: false, from: s?.from ?? '', fromName: s?.fromName ?? '' };
};

// Fuori dal componente: se fosse definito dentro, a ogni tasto verrebbe ricreato e il campo perderebbe il focus.
function Field({ name, label, help, error, children }) {
  return (
    <label className="fld" data-path={name}>
      <span className="fld__label">{label}</span>
      {children}
      {help && <span className="fld__help">{help}</span>}
      {error && <span className="fld__issues"><span className="bad" role="alert">{error}</span></span>}
    </label>
  );
}

export default function EmailSettings({ initial, adminEmail }) {
  const [view, setView] = useState(initial);
  const [f, setF] = useState(() => blank(initial));
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState(null);
  const [testTo, setTestTo] = useState(adminEmail ?? '');
  const [test, setTest] = useState(null);
  const [busy, start] = useTransition();
  const [asked, setAsked] = useState(false);
  const s = view.settings;
  const set = (part) => { setF((cur) => ({ ...cur, ...part })); setMsg(null); };
  const [tone, sourceText] = SOURCE[view.source];

  const save = (e) => {
    e.preventDefault();
    setErrors({}); setMsg(null); setTest(null);
    start(async () => {
      const r = await saveMailSettingsAction(f);
      if (r.ok) { setView(r.view); setF(blank(r.view)); setMsg({ ok: true, text: 'Impostazioni salvate.' }); }
      else { setErrors(r.errors ?? {}); setMsg({ ok: false, text: 'Controlla i campi evidenziati.' }); }
    });
  };
  const remove = () => start(async () => {
    const r = await deleteMailSettingsAction();
    setAsked(false); setView(r.view); setF(blank(r.view)); setTest(null); setMsg({ ok: true, text: 'Impostazioni salvate rimosse.' });
  });
  const sendTest = () => { setTest(null); start(async () => { setTest(await sendTestMailAction(testTo)); }); };

  return (
    <div className="mailset">
      <p className={`notice notice--${tone}`} role="status">{sourceText}</p>
      {!view.canEncrypt && <p className="notice notice--bad" role="alert">Nel file .env del server manca <code>SETTINGS_SECRET</code>: senza, non si può salvare una password. Aggiungi una stringa casuale lunga (almeno 16 caratteri) e riavvia l&apos;app.</p>}
      {s && !s.passwordReadable && <p className="notice notice--bad" role="alert">La password salvata non si può più leggere (la chiave <code>SETTINGS_SECRET</code> è cambiata). Inseriscila di nuovo.</p>}

      <form className="card" onSubmit={save} noValidate>
        <h2>Server SMTP</h2>
        <div className="mailset__grid">
          <Field name="host" error={errors.host} label="Server" help="Il nome del server di posta in uscita, come indicato dal fornitore (es. smtp.esempio.ch).">
            <input name="host" value={f.host} autoComplete="off" spellCheck={false} onChange={(e) => set({ host: e.target.value })} placeholder="smtp.esempio.ch" />
          </Field>
          <Field name="security" error={errors.security} label="Connessione">
            <select name="security" value={f.security} onChange={(e) => set({ security: e.target.value, port: PORTS[e.target.value] })}>
              {SECURITY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field name="port" error={errors.port} label="Porta">
            <input name="port" type="number" min={1} max={65535} value={f.port} onChange={(e) => set({ port: e.target.value })} />
          </Field>
          <Field name="user" error={errors.user} label="Utente" help="Di solito l'indirizzo email dell'account. Vuoto se il server non richiede l'accesso.">
            <input name="user" value={f.user} autoComplete="off" spellCheck={false} onChange={(e) => set({ user: e.target.value })} />
          </Field>
          <Field name="password" error={errors.password} label="Password" help={s?.hasPassword && !f.clearPassword ? 'Una password è già salvata (cifrata). Lascia vuoto per tenerla, oppure scrivine una nuova. Se cambi server, porta, utente o connessione va reinserita: per sicurezza quella vecchia non si riusa.' : 'Non viene mai mostrata dopo il salvataggio.'}>
            <input name="password" type="password" value={f.password} autoComplete="new-password" placeholder={s?.hasPassword && !f.clearPassword ? '••••••••  (salvata)' : ''} onChange={(e) => set({ password: e.target.value })} disabled={!view.canEncrypt} />
          </Field>
          {s?.hasPassword && (
            <label className="check mailset__clear"><input type="checkbox" checked={f.clearPassword} onChange={(e) => set({ clearPassword: e.target.checked, password: '' })} /> Rimuovi la password salvata</label>
          )}
        </div>
        <h2>Mittente</h2>
        <div className="mailset__grid">
          <Field name="from" error={errors.from} label="Indirizzo del mittente" help="Un indirizzo del dominio autorizzato dal server (altrimenti le email finiscono nello spam o vengono rifiutate).">
            <input name="from" type="email" value={f.from} autoComplete="off" onChange={(e) => set({ from: e.target.value })} placeholder="sito@esempio.ch" />
          </Field>
          <Field name="fromName" error={errors.fromName} label="Nome del mittente (facoltativo)" help="Come compare nella casella di chi riceve.">
            <input name="fromName" value={f.fromName} maxLength={100} onChange={(e) => set({ fromName: e.target.value })} placeholder="Sito Mammano Traslochi" />
          </Field>
        </div>
        {f.security === 'none' && <p className="notice notice--warn">Senza cifratura la password e le email viaggiano in chiaro: usalo solo su un server nella tua rete o per prove.</p>}
        <div className="mailset__actions">
          <button className="btn btn--primary" type="submit" disabled={busy}>{busy ? 'Salvataggio…' : 'Salva impostazioni'}</button>
          {s && (asked
            ? <span className="mdet__confirm"><span>Rimuovere le impostazioni salvate?</span> <button type="button" className="btn btn--danger" disabled={busy} onClick={remove}>Sì, rimuovi</button> <button type="button" className="btn" onClick={() => setAsked(false)}>Annulla</button></span>
            : <button type="button" className="btn" disabled={busy} onClick={() => setAsked(true)}>Rimuovi le impostazioni salvate</button>)}
        </div>
        {msg && <p className={msg.ok ? 'ok' : 'bad'} role="status">{msg.text}</p>}
        {s?.updatedAt && <p className="hint">Ultima modifica: {new Date(s.updatedAt).toLocaleString('it-CH', { timeZone: 'Europe/Zurich' })}{s.updatedBy ? `, ${s.updatedBy}` : ''}.</p>}
      </form>

      <section className="card">
        <h2>Email di prova</h2>
        <p className="hint">Invia un messaggio con le impostazioni <strong>salvate</strong> (salva prima, poi prova). Se arriva, anche le richieste dei moduli arriveranno.</p>
        <div className="mailset__test">
          <input type="email" aria-label="Indirizzo a cui inviare la prova" value={testTo} onChange={(e) => { setTestTo(e.target.value); setTest(null); }} />
          <button type="button" className="btn" disabled={busy || view.source === 'none' || !testTo} onClick={sendTest}>Invia email di prova</button>
        </div>
        {test && <p className={test.ok ? 'ok' : 'bad'} role="status">{test.ok ? `Email inviata a ${test.to}. Controlla la casella (anche lo spam).` : `Invio non riuscito: ${test.error}`}</p>}
      </section>
    </div>
  );
}
