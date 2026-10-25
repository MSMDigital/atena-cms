'use client';

// Scheda di un utente: accesso (nome utente, email, ruolo, password), profilo (nome, descrizione, immagine, social) e dati SEO/GEO dell'autore.
// mode: 'create' (nuovo utente, solo admin), 'edit' (modifica di un utente, solo admin), 'profile' (il proprio profilo: niente ruolo, nome utente, email).
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import MediaPicker from '../_editor/MediaPicker';
import { passwordProblem, MIN_PASSWORD } from '@/lib/password-policy.mjs';
import { ROLES, ROLE_LABEL } from '@/lib/permissions.mjs';
import { useT } from '@/app/admin/_i18n/I18nProvider';
import { saveUserAction, resetPasswordAction, deleteUserAction } from './actions';

const HELP_ROLE = { admin: 'Gestisce tutto: utenti e ruoli, contenuti, impostazioni.', author: 'Crea e modifica i propri contenuti (articoli, pagine, immagini); li salva come bozze.', normal: 'Per ora nessun privilegio.' };
const strongRandom = () => {
  const sets = ['abcdefghijkmnopqrstuvwxyz', 'ABCDEFGHJKLMNPQRSTUVWXYZ', '23456789', '!#$%&*+-=?@^_'];
  const all = sets.join('');
  const pick = (s) => s[crypto.getRandomValues(new Uint32Array(1))[0] % s.length];
  const chars = [...sets.map(pick), ...Array.from({ length: 16 }, () => pick(all))];
  for (let i = chars.length - 1; i > 0; i--) { const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join('');
};

function Field({ label, error, help, children }) {
  return (
    <label className="uf__field">
      <span className="uf__label">{label}</span>
      {children}
      {help && <span className="fld__help">{help}</span>}
      {error && <span className="uf__err" role="alert">{error}</span>}
    </label>
  );
}

export default function UserForm({ mode, initial, isSelf = false, media = null, maxMb, save = saveUserAction, afterSave }) {
  const t = useT();
  const router = useRouter();
  const profile = mode === 'profile';
  const create = mode === 'create';
  const [f, setF] = useState(() => ({
    username: initial?.username ?? '', email: initial?.email ?? '', role: initial?.role ?? 'author', active: initial?.active ?? true,
    password: '', firstName: initial?.firstName ?? '', lastName: initial?.lastName ?? '', description: initial?.description ?? '', avatar: initial?.avatar ?? '',
    linkedin: initial?.linkedin ?? '', socials: initial?.socials?.length ? initial.socials : [], showPublic: initial?.showPublic ?? true,
    seo: { title: '', description: '', jobTitle: '', noindex: false, ...(initial?.seo ?? {}), knowsAbout: (initial?.seo?.knowsAbout ?? []).join(', ') },
  }));
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState(null);
  const [show, setShow] = useState(false);
  const [picker, setPicker] = useState(false);
  const [items, setItems] = useState(media ?? []);
  const [busy, start] = useTransition();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const setSeo = (k) => (e) => setF({ ...f, seo: { ...f.seo, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value } });
  const pwProblem = create && f.password ? passwordProblem(f.password, f) : null;

  const submit = (e) => {
    e.preventDefault();
    setMsg(null);
    start(async () => {
      const input = { ...f, ...(initial?.id ? { id: initial.id } : {}) };
      if (profile) { delete input.username; delete input.email; delete input.role; delete input.active; delete input.password; }
      if (!create) delete input.password;
      const r = await save(input);
      if (r.ok) {
        setErrors({});
        if (create) { router.push('/admin/users'); router.refresh(); return; }
        setMsg({ tone: 'ok', text: t('Salvato.') });
        afterSave?.();
        router.refresh();
      } else { setErrors(r.errors ?? {}); setMsg({ tone: 'bad', text: r.error ?? t('Controlla i campi evidenziati.') }); }
    });
  };

  return (
    <>
    <form className="uf" onSubmit={submit} noValidate>
      {msg && <p className={`notice notice--${msg.tone}`} role="status">{msg.text}</p>}

      {!profile && (
        <section className="card uf__sec">
          <h2>{t('Accesso')}</h2>
          <div className="uf__grid">
            <Field label={t('Nome utente')} error={errors.username} help={t("Per accedere e per l'indirizzo della pagina autore. Lettere minuscole, numeri, punto, trattino.")}>
              <input value={f.username} onChange={set('username')} autoComplete="off" autoCapitalize="none" spellCheck={false} required />
            </Field>
            <Field label={t('Email')} error={errors.email}><input type="email" value={f.email} onChange={set('email')} autoComplete="off" required /></Field>
            <Field label={t('Ruolo')} error={errors.role} help={t(HELP_ROLE[f.role])}>
              <select value={f.role} onChange={set('role')} disabled={isSelf}>{ROLES.map((r) => <option key={r} value={r}>{t(ROLE_LABEL[r])}</option>)}</select>
            </Field>
            {!create && !isSelf && <label className="check uf__check"><input type="checkbox" checked={f.active} onChange={set('active')} /> {t('Account attivo (se spento non può accedere)')}</label>}
          </div>
          {isSelf && <p className="fld__help">{t('Non puoi cambiare il tuo ruolo né disattivarti: chiedilo a un altro amministratore.')}</p>}
          {create && (
            <div className="uf__pw">
              <Field label={t('Password')} error={errors.password} help={t('Almeno {n} caratteri, con almeno tre tipi tra minuscole, maiuscole, numeri e simboli; non deve contenere nome utente o email.', { n: MIN_PASSWORD })}>
                <span className="uf__pwrow">
                  <input type={show ? 'text' : 'password'} value={f.password} onChange={set('password')} autoComplete="new-password" required />
                  <button type="button" className="btn" onClick={() => setShow(!show)}>{show ? t('Nascondi') : t('Mostra')}</button>
                  <button type="button" className="btn" onClick={() => { setF({ ...f, password: strongRandom() }); setShow(true); }}>{t('Genera')}</button>
                </span>
              </Field>
              {f.password && <p className={pwProblem ? 'uf__err' : 'uf__ok'}>{pwProblem ? t(pwProblem) : t('Password sicura. Copiala ora e consegnala all\'utente: non sarà più visibile.')}</p>}
            </div>
          )}
        </section>
      )}

      <section className="card uf__sec">
        <h2>{t('Profilo')}</h2>
        <div className="uf__grid">
          <Field label={t('Nome')} error={errors.firstName}><input value={f.firstName} onChange={set('firstName')} required /></Field>
          <Field label={t('Cognome')} error={errors.lastName}><input value={f.lastName} onChange={set('lastName')} /></Field>
        </div>
        <Field label={t('Descrizione')} error={errors.description} help={t('Una breve biografia: compare nella pagina autore.')}>
          <textarea rows={4} value={f.description} maxLength={2000} onChange={set('description')} />
        </Field>
        {media && (
          <div className="uf__avatar">
            <span className="uf__label">{t('Immagine profilo')}</span>
            <span className="uf__avrow">
              {f.avatar ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/admin/media/thumb/${f.avatar}`} alt="" width="72" height="72" /> : <span className="uf__noav" aria-hidden="true">?</span>}
              <button type="button" className="btn" onClick={() => setPicker(true)}>{f.avatar ? t('Cambia immagine') : t('Scegli immagine')}</button>
              {f.avatar && <button type="button" className="link" onClick={() => setF({ ...f, avatar: '' })}>{t('Togli')}</button>}
            </span>
            {errors.avatar && <span className="uf__err" role="alert">{errors.avatar}</span>}
          </div>
        )}
        <Field label="LinkedIn" error={errors.linkedin}><input type="url" value={f.linkedin} onChange={set('linkedin')} placeholder="https://www.linkedin.com/in/…" /></Field>
        <div className="uf__socials">
          <span className="uf__label">{t('Altri social')}</span>
          {f.socials.map((s, i) => (
            <span key={i} className="uf__social">
              <input value={s.label} placeholder={t('Nome (Instagram, X, sito…)')} aria-label={t('Nome del social')} onChange={(e) => setF({ ...f, socials: f.socials.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })} />
              <input value={s.url} placeholder="https://…" aria-label={t('Indirizzo del social')} onChange={(e) => setF({ ...f, socials: f.socials.map((x, k) => (k === i ? { ...x, url: e.target.value } : x)) })} />
              <button type="button" className="link link--danger" onClick={() => setF({ ...f, socials: f.socials.filter((_, k) => k !== i) })}>{t('Togli')}</button>
            </span>
          ))}
          {errors.socials && <span className="uf__err" role="alert">{errors.socials}</span>}
          <button type="button" className="add" disabled={f.socials.length >= 12} onClick={() => setF({ ...f, socials: [...f.socials, { label: '', url: '' }] })}>{t('+ Aggiungi social')}</button>
        </div>
      </section>

      <section className="card uf__sec">
        <h2>{t('Dati per SEO e GEO')}</h2>
        <p className="fld__help">{t("Usati per la pagina autore (se attivata in Impostazioni → SEO & Geo) e per i dati strutturati degli articoli firmati: aiutano Google e le AI a riconoscere l'autore.")}</p>
        <label className="check uf__check"><input type="checkbox" checked={f.showPublic} onChange={set('showPublic')} /> {t('Mostra questo autore sul sito')}</label>
        <Field label={t('Titolo SEO')} help={t('Il titolo della pagina autore per Google. Vuoto: il nome.')}><input value={f.seo.title} maxLength={120} onChange={setSeo('title')} /></Field>
        <Field label={t('Descrizione SEO')} help={t('Vuota: si usa la descrizione del profilo.')}><textarea rows={2} value={f.seo.description} maxLength={300} onChange={setSeo('description')} /></Field>
        <div className="uf__grid">
          <Field label={t('Qualifica o ruolo professionale')} help={t('Per esempio «Business coach» o «Consulente SEO».')}><input value={f.seo.jobTitle} maxLength={80} onChange={setSeo('jobTitle')} /></Field>
          <Field label={t('Argomenti di competenza')} help={t('Separati da virgola: leadership, comunicazione, AI e lavoro.')}><input value={f.seo.knowsAbout} onChange={setSeo('knowsAbout')} /></Field>
        </div>
        <label className="check uf__check"><input type="checkbox" checked={!!f.seo.noindex} onChange={setSeo('noindex')} /> {t('Non indicizzare la pagina di questo autore')}</label>
      </section>

      <div className="uf__actions"><button className="btn btn--primary" disabled={busy || (create && !!pwProblem)}>{busy ? t('Salvo…') : create ? t('Crea utente') : t('Salva')}</button>{!profile && <a className="btn" href="/admin/users">{t('Annulla')}</a>}</div>

      {picker && <MediaPicker media={items} current={f.avatar} maxMb={maxMb} onUploaded={(item) => setItems((cur) => [item, ...cur.filter((i) => i.path !== item.path)])} onPick={(item) => { setF({ ...f, avatar: item.path }); setPicker(false); }} onClose={() => setPicker(false)} />}

    </form>
    {mode === 'edit' && <DangerZone user={initial} isSelf={isSelf} />}
    </>
  );
}

// Reimposta la password ed elimina l'utente. Fuori dal modulo principale: sono azioni a sé, con la loro conferma.
function DangerZone({ user, isSelf }) {
  const t = useT();
  const router = useRouter();
  const [chosen, setChosen] = useState('');
  const [out, setOut] = useState(null);
  const [busy, start] = useTransition();
  const reset = (generated) => {
    if (!window.confirm(t("Reimpostare la password di {name}? L'utente verrà disconnesso e dovrà usare quella nuova.", { name: user.username }))) return;
    start(async () => { setOut(null); const r = await resetPasswordAction(user.id, generated ? '' : chosen); setOut(r.ok ? { ok: true, password: r.password } : { ok: false, text: r.error }); if (r.ok) setChosen(''); });
  };
  const remove = () => {
    if (!window.confirm(t("Eliminare l'utente {name}? I suoi contenuti restano nel sito, ma senza proprietario. Non si può annullare.", { name: user.username }))) return;
    start(async () => { const r = await deleteUserAction(user.id); if (r.ok) { router.push('/admin/users'); router.refresh(); } else setOut({ ok: false, text: r.error }); });
  };
  const problem = chosen ? passwordProblem(chosen, user) : null;
  return (
    <section className="card uf__sec">
      <h2>{t('Password e account')}</h2>
      <div className="uf__pw">
        <span className="uf__label">{t('Reimposta la password')}</span>
        <span className="uf__pwrow">
          <input type="text" value={chosen} onChange={(e) => setChosen(e.target.value)} placeholder={t('Una password scelta da te (facoltativa)')} autoComplete="off" aria-label={t('Nuova password')} />
          <button type="button" className="btn" disabled={busy || !chosen || !!problem} onClick={() => reset(false)}>{t('Imposta questa')}</button>
          <button type="button" className="btn" disabled={busy} onClick={() => reset(true)}>{t('Genera e imposta')}</button>
        </span>
        {problem && <p className="uf__err">{t(problem)}</p>}
        {out?.ok && <p className="notice notice--ok" role="status">{out.password ? <>{t('Nuova password (mostrata una sola volta):')} <code className="uf__code">{out.password}</code> <button type="button" className="link" onClick={() => navigator.clipboard?.writeText(out.password)}>{t('Copia')}</button></> : t('Password impostata. L\'utente è stato disconnesso.')}</p>}
        {out && !out.ok && <p className="uf__err" role="alert">{out.text}</p>}
      </div>
      {!isSelf && <div className="uf__del"><button type="button" className="btn btn--danger" disabled={busy} onClick={remove}>{t('Elimina utente')}</button></div>}
    </section>
  );
}
