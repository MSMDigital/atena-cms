'use client';

import { useState, useTransition } from 'react';
import { useT } from '@/app/admin/_i18n/I18nProvider';
import { saveMailSettingsAction, deleteMailSettingsAction, sendTestMailAction, saveMailRecipientsAction } from './actions';
import { formatStamp } from '@/render/format.mjs';

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

// Le parti tra \u0001 … \u0001 vanno in <code>.
const code = (text) => text.split('\u0001').map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part));

const blank = (view) => {
  const s = view.settings;
  return { provider: s?.provider ?? 'smtp', domain: s?.domain ?? '', apiKey: '', clearApiKey: false, host: s?.host ?? '', port: s?.port ?? 587, security: s?.security ?? 'starttls', user: s?.user ?? '', password: '', clearPassword: false, from: s?.from ?? '', fromName: s?.fromName ?? '' };
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

export default function EmailSettings({ initial, adminEmail, adminName = '', general = {}, recipients: initialRecipients = [] }) {
  const t = useT();
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
      if (r.ok) { setView(r.view); setF(blank(r.view)); setMsg({ ok: true, text: t('Impostazioni salvate.') }); }
      else { setErrors(r.errors ?? {}); setMsg({ ok: false, text: t('Controlla i campi evidenziati.') }); }
    });
  };
  const remove = () => start(async () => {
    const r = await deleteMailSettingsAction();
    setAsked(false); setView(r.view); setF(blank(r.view)); setTest(null); setMsg({ ok: true, text: t('Impostazioni salvate rimosse.') });
  });
  const sendTest = () => { setTest(null); start(async () => { setTest(await sendTestMailAction(testTo)); }); };

  return (
    <div className="mailset">
      <p className={`notice notice--${tone}`} role="status">{t(sourceText)}</p>
      {!view.canEncrypt && <p className="notice notice--bad" role="alert">{code(t("Nel file .env del server manca {x}: senza, non si può salvare una password. Aggiungi una stringa casuale lunga (almeno 16 caratteri) e riavvia l'app.", { x: '\u0001SETTINGS_SECRET\u0001' }))}</p>}
      {s && s.provider !== 'brevo' && !s.passwordReadable && <p className="notice notice--bad" role="alert">{code(t('La password salvata non si può più leggere (la chiave {x} è cambiata). Inseriscila di nuovo.', { x: '\u0001SETTINGS_SECRET\u0001' }))}</p>}
      {s?.provider === 'brevo' && !s.apiKeyReadable && <p className="notice notice--bad" role="alert">{code(t('La chiave API salvata non si può più leggere (la chiave {x} è cambiata). Incollala di nuovo.', { x: '\u0001SETTINGS_SECRET\u0001' }))}</p>}
      <Recipients initial={initialRecipients} adminEmail={general.adminEmail} />

      <form className="card" onSubmit={save} noValidate>
        <h2>{t('Come inviare le email')}</h2>
        <div className="mailset__grid">
          <Field name="provider" error={errors.provider} label={t('Servizio')} help={f.provider === 'brevo' ? t('Le email partono dall\'API di Brevo con una chiave: niente server SMTP da configurare.') : t('Un server di posta in uscita (SMTP) fornito dal tuo hosting o da un servizio di invio.')}>
            <select name="provider" value={f.provider} onChange={(e) => set({ provider: e.target.value })}>
              <option value="smtp">{t('Server SMTP')}</option>
              <option value="brevo">{t('Brevo (chiave API)')}</option>
            </select>
          </Field>
        </div>
        {f.provider === 'brevo' ? (
          <div className="mailset__grid">
            <Field name="apiKey" error={errors.apiKey} label={t('Chiave API di Brevo')} help={s?.provider === 'brevo' && s.hasApiKey && !f.clearApiKey ? t('Una chiave è già salvata (cifrata). Lascia vuoto per tenerla, oppure incollane una nuova.') : t('In Brevo: SMTP e API → Chiavi API → Genera una nuova chiave API. Non viene mai mostrata dopo il salvataggio. Il dominio qui sotto deve essere autenticato in Brevo (Mittenti, domini e IP → Domini).')}>
              <input name="apiKey" type="password" value={f.apiKey} autoComplete="new-password" spellCheck={false} placeholder={s?.provider === 'brevo' && s.hasApiKey && !f.clearApiKey ? t('••••••••  (salvata)') : 'xkeysib-…'} onChange={(e) => set({ apiKey: e.target.value })} disabled={!view.canEncrypt} />
            </Field>
          </div>
        ) : (
          <>
        <div className="mailset__grid">
          <Field name="host" error={errors.host} label={t('Server')} help={t('Il nome del server di posta in uscita, come indicato dal fornitore (es. smtp.esempio.ch).')}>
            <input name="host" value={f.host} autoComplete="off" spellCheck={false} onChange={(e) => set({ host: e.target.value })} placeholder="smtp.esempio.ch" />
          </Field>
          <Field name="security" error={errors.security} label={t('Connessione')}>
            <select name="security" value={f.security} onChange={(e) => set({ security: e.target.value, port: PORTS[e.target.value] })}>
              {SECURITY.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}
            </select>
          </Field>
          <Field name="port" error={errors.port} label={t('Porta')}>
            <input name="port" type="number" min={1} max={65535} value={f.port} onChange={(e) => set({ port: e.target.value })} />
          </Field>
          <Field name="user" error={errors.user} label={t('Utente')} help={t("Di solito l'indirizzo email dell'account. Vuoto se il server non richiede l'accesso.")}>
            <input name="user" value={f.user} autoComplete="off" spellCheck={false} onChange={(e) => set({ user: e.target.value })} />
          </Field>
          <Field name="password" error={errors.password} label={t('Password')} help={s?.hasPassword && !f.clearPassword ? t('Una password è già salvata (cifrata). Lascia vuoto per tenerla, oppure scrivine una nuova. Se cambi server, porta, utente o connessione va reinserita: per sicurezza quella vecchia non si riusa.') : t('Non viene mai mostrata dopo il salvataggio.')}>
            <input name="password" type="password" value={f.password} autoComplete="new-password" placeholder={s?.hasPassword && !f.clearPassword ? t('••••••••  (salvata)') : ''} onChange={(e) => set({ password: e.target.value })} disabled={!view.canEncrypt} />
          </Field>
          {s?.hasPassword && (
            <label className="check mailset__clear"><input type="checkbox" checked={f.clearPassword} onChange={(e) => set({ clearPassword: e.target.checked, password: '' })} /> {t('Rimuovi la password salvata')}</label>
          )}
        </div>
          </>
        )}
        <h2>{t('Mittente')}</h2>
        <div className="mailset__grid">
          {f.provider === 'brevo' ? (
            <Field name="domain" error={errors.domain} label={t('Dominio da cui inviare')} help={t('Il dominio autenticato in Brevo. Le email partono da no-reply@{domain}; chi scrive dal modulo è nel «Rispondi a».', { domain: f.domain.trim() || 'esempio.ch' })}>
              <input name="domain" value={f.domain} autoComplete="off" spellCheck={false} autoCapitalize="none" onChange={(e) => set({ domain: e.target.value })} placeholder="esempio.ch" />
            </Field>
          ) : (
            <Field name="from" error={errors.from} label={t('Indirizzo del mittente')} help={t('Un indirizzo del dominio autorizzato dal server (altrimenti le email finiscono nello spam o vengono rifiutate).')}>
              <input name="from" type="email" value={f.from} autoComplete="off" onChange={(e) => set({ from: e.target.value })} placeholder="sito@esempio.ch" />
            </Field>
          )}
          <Field name="fromName" error={errors.fromName} label={t('Nome del mittente (facoltativo)')} help={adminName ? t("Come compare nella casella di chi riceve. Vuoto: si usa il nome dell'account amministratore ({name}).", { name: adminName }) : t("Come compare nella casella di chi riceve. Vuoto: il nome dell'account amministratore.")}>
            <input name="fromName" value={f.fromName} maxLength={100} onChange={(e) => set({ fromName: e.target.value })} placeholder={adminName || t('Nome dell\'account amministratore')} />
          </Field>
        </div>
        {f.provider !== 'brevo' && f.security === 'none' && <p className="notice notice--warn">{t('Senza cifratura la password e le email viaggiano in chiaro: usalo solo su un server nella tua rete o per prove.')}</p>}
        <div className="mailset__actions">
          <button className="btn btn--primary" type="submit" disabled={busy}>{busy ? t('Salvataggio…') : t('Salva impostazioni')}</button>
          {s && (asked
            ? <span className="mdet__confirm"><span>{t('Rimuovere le impostazioni salvate?')}</span> <button type="button" className="btn btn--danger" disabled={busy} onClick={remove}>{t('Sì, rimuovi')}</button> <button type="button" className="btn" onClick={() => setAsked(false)}>{t('Annulla')}</button></span>
            : <button type="button" className="btn" disabled={busy} onClick={() => setAsked(true)}>{t('Rimuovi le impostazioni salvate')}</button>)}
        </div>
        {msg && <p className={msg.ok ? 'ok' : 'bad'} role="status">{msg.text}</p>}
        {s?.updatedAt && <p className="hint">{s.updatedBy ? t('Ultima modifica: {when}, {who}.', { when: formatStamp(s.updatedAt, general), who: s.updatedBy }) : t('Ultima modifica: {when}.', { when: formatStamp(s.updatedAt, general) })}</p>}
      </form>

      <section className="card">
        <h2>{t('Email di prova')}</h2>
        <p className="hint">{t('Invia un messaggio con le impostazioni {x} (salva prima, poi prova). Se arriva, anche le richieste dei moduli arriveranno.', { x: '\u0001' + t('salvate') + '\u0001' }).split('\u0001').map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part))}</p>
        <div className="mailset__test">
          <input type="email" aria-label={t('Indirizzo a cui inviare la prova')} value={testTo} onChange={(e) => { setTestTo(e.target.value); setTest(null); }} />
          <button type="button" className="btn" disabled={busy || view.source === 'none' || !testTo} onClick={sendTest}>{t('Invia email di prova')}</button>
        </div>
        {test && <p className={test.ok ? 'ok' : 'bad'} role="status">{test.ok ? t('Email inviata a {to}. Controlla la casella (anche lo spam).', { to: test.to }) : t('Invio non riuscito: {error}', { error: test.error })}</p>}
      </section>
    </div>
  );
}

// Gli indirizzi che ricevono le richieste dei moduli (quando il modulo non ne indica di suoi).
function Recipients({ initial, adminEmail }) {
  const t = useT();
  const [text, setText] = useState(initial.join('\n'));
  const [msg, setMsg] = useState(null);
  const [busy, start] = useTransition();
  const save = (e) => { e.preventDefault(); setMsg(null); start(async () => { const r = await saveMailRecipientsAction(text); if (r.ok) { setText(r.recipients.join('\n')); setMsg({ ok: true, text: r.recipients.length ? t('Destinatari salvati.') : t('Nessun destinatario: si usa l\'email dell\'amministrazione.') }); } else setMsg({ ok: false, text: r.error }); }); };
  return (
    <form className="card" onSubmit={save}>
      <h2>{t('A chi arrivano le email delle richieste')}</h2>
      <label className="fld">
        <span className="fld__label">{t('Indirizzi email (uno per riga)')}</span>
        <textarea rows={3} value={text} onChange={(e) => { setText(e.target.value); setMsg(null); }} placeholder={adminEmail || 'info@esempio.ch'} spellCheck={false} />
        <span className="fld__help">{adminEmail ? t("Ricevono le richieste inviate dai moduli del sito (contatti, preventivi…). Un modulo può avere i suoi destinatari nella pagina; questi valgono per gli altri. Vuoto: si usa l'email dell'amministrazione ({email}).", { email: adminEmail }) : t("Ricevono le richieste inviate dai moduli del sito (contatti, preventivi…). Un modulo può avere i suoi destinatari nella pagina; questi valgono per gli altri. Vuoto: si usa l'email dell'amministrazione (Impostazioni → Generale).")}</span>
      </label>
      <div className="mailset__actions"><button className="btn btn--primary" type="submit" disabled={busy}>{busy ? t('Salvataggio…') : t('Salva destinatari')}</button></div>
      {msg && <p className={msg.ok ? 'ok' : 'bad'} role="status">{msg.text}</p>}
    </form>
  );
}

