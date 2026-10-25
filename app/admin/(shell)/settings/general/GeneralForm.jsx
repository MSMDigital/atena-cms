'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DATE_FORMATS, REGION_PRESETS, formatDate, formatStamp, formatTime } from '@/render/format.mjs';
import { useT } from '@/app/admin/_i18n/I18nProvider';
import { saveGeneralAction } from '../actions';

const WEEK = [[1, 'Lunedì'], [6, 'Sabato'], [0, 'Domenica']];
const region = (z) => z.split('/')[0];

// Fuori dal componente: se fosse definito dentro, a ogni tasto verrebbe ricreato e il campo perderebbe il focus.
const F = ({ label, error, help, children }) => (
  <label className="uf__field"><span className="uf__label">{label}</span>{children}{help && <span className="fld__help">{help}</span>}{error && <span className="uf__err" role="alert">{error}</span>}</label>
);


export default function GeneralForm({ initial, zones, myEmail }) {
  const t = useT();
  const router = useRouter();
  const [f, setF] = useState({ ...initial, dateFormat: initial.dateFormat ?? '' });
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState(null);
  const [busy, start] = useTransition();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const now = new Date();
  const sample = (fmt) => formatDate('2026-11-03', { dateFormat: fmt || null }, f.cmsLanguage);
  const groups = [...new Set(zones.map(region))];

  const submit = (e) => {
    e.preventDefault();
    setMsg(null);
    start(async () => {
      const r = await saveGeneralAction({ ...f, weekStart: Number(f.weekStart) });
      if (r.ok) { setErrors({}); setMsg({ tone: 'ok', text: t('Salvato.') }); router.refresh(); } else { setErrors(r.errors ?? {}); setMsg({ tone: 'bad', text: t('Controlla i campi evidenziati.') }); }
    });
  };
  return (
    <form className="uf" onSubmit={submit}>
      {msg && <p className={`notice notice--${msg.tone}`} role="status">{msg.text}</p>}
      <section className="card uf__sec">
        <h2>{t('Notifiche')}</h2>
        <F label={t("Email dell'amministrazione")} error={errors.adminEmail} help={t("Riceve le notifiche del CMS: l'avviso se una pubblicazione pianificata non riesce e, finché non indichi altri destinatari in Impostazioni → Email, le richieste dei moduli del sito.")}>
          <input type="email" value={f.adminEmail} onChange={set('adminEmail')} placeholder={myEmail} />
        </F>
        {!f.adminEmail && <button type="button" className="link" onClick={() => setF({ ...f, adminEmail: myEmail })}>{t('Usa la mia email ({email})', { email: myEmail })}</button>}
      </section>
      <section className="card uf__sec">
        <h2>{t('Data e ora')}</h2>
        <F label={t('Adatta data e ora a un formato regionale')} help={t("Imposta in un colpo formato della data, formato dell'ora e primo giorno della settimana. Puoi poi ritoccare ogni voce.")}>
          <select value="" onChange={(e) => { const p = REGION_PRESETS[e.target.value]; if (p) setF({ ...f, ...p }); }}>
            <option value="">{t('Scegli…')}</option>
            <option value="it">{t('Italia / Svizzera (03.11.2026, 24 ore, lunedì)')}</option>
            <option value="gb">{t('Regno Unito (03/11/2026, 24 ore, lunedì)')}</option>
            <option value="us">{t('Stati Uniti (11/03/2026, 12 ore AM/PM, domenica)')}</option>
          </select>
        </F>
        <div className="uf__grid uf__grid--2">
          <F label={t('Fuso orario')} error={errors.timezone} help={t('Ora attuale: {now}. Vale per le pubblicazioni pianificate e per gli orari mostrati.', { now: formatStamp(now, f, f.cmsLanguage) })}>
            <select value={f.timezone} onChange={set('timezone')}>
              {groups.map((g) => <optgroup key={g} label={g}>{zones.filter((z) => region(z) === g).map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}</optgroup>)}
            </select>
          </F>
          <F label={t('Formato della data')} error={errors.dateFormat} help={t('Anche le date degli articoli del sito. «Predefinita» lascia la scrittura attuale dei template.')}>
            <select value={f.dateFormat} onChange={set('dateFormat')}>
              <option value="">{t('Predefinita ({sample})', { sample: sample('') })}</option>
              {DATE_FORMATS.map((d) => <option key={d} value={d}>{sample(d)} ({d})</option>)}
            </select>
          </F>
          <F label={t("Formato dell'ora")} error={errors.timeFormat}>
            <select value={f.timeFormat} onChange={set('timeFormat')}><option value="24h">{t('24 ore (14:30)')}</option><option value="12h">{t('12 ore (2:30 PM)')}</option></select>
          </F>
          <F label={t('Primo giorno della settimana')} error={errors.weekStart} help={t('Lo usano i calendari e gli elenchi settimanali dei template.')}>
            <select value={f.weekStart} onChange={set('weekStart')}>{WEEK.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}</select>
          </F>
        </div>
        <p className="fld__help">{t('Esempio con le scelte fatte: {date}, {time}', { date: formatDate(now, f, f.cmsLanguage), time: formatTime(now, f) })}</p>
      </section>
      <section className="card uf__sec">
        <h2>{t("Lingua dell'interfaccia")}</h2>
        <F label={t('Lingua del CMS')} error={errors.cmsLanguage} help={t('Italiano o inglese: cambia i testi dell\'admin (menu, pagine, messaggi) e i nomi dei mesi. Le lingue del sito si scelgono in Lingue.')}>
          <select value={f.cmsLanguage} onChange={set('cmsLanguage')}><option value="it">{t('Italiano')}</option><option value="en">{t('English')}</option></select>
        </F>
      </section>
      <div className="uf__actions"><button className="btn btn--primary" disabled={busy}>{busy ? t('Salvo…') : t('Salva')}</button></div>
    </form>
  );
}
