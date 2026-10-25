'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/app/admin/_i18n/I18nProvider';
import { createApiTokenAction, revokeApiTokenAction, deleteApiTokenAction } from './actions';

export default function ApiTokens({ tokens, users, endpoint }) {
  const t = useT();
  const router = useRouter();
  const [f, setF] = useState({ name: '', userId: users[0]?.id ?? '', days: '90' });
  const [fresh, setFresh] = useState(null);   // il token appena creato, mostrato una sola volta
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [busy, start] = useTransition();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const create = (e) => {
    e.preventDefault(); setError(null); setFresh(null);
    start(async () => {
      const r = await createApiTokenAction(f);
      if (r.ok) { setFresh(r.token); setF({ ...f, name: '' }); router.refresh(); } else setError(r.error);
    });
  };
  const act = (fn, id, ask) => {
    if (ask && !window.confirm(ask)) return;
    start(async () => { const r = await fn(id); if (!r.ok) setError(r.error); router.refresh(); });
  };
  const copy = async (text) => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard non disponibile */ } };
  const state = (x) => (x.revoked ? t('Revocato') : x.expired ? t('Scaduto') : !x.userActive ? t('Utente disattivato') : t('Attivo'));

  return (
    <>
      {fresh && (
        <div className="notice notice--ok" role="status">
          <p><strong>{t('Copia ora il token: non sarà più visibile.')}</strong></p>
          <p><code>{fresh}</code> <button type="button" className="link" onClick={() => copy(fresh)}>{copied ? t('Copiato') : t('Copia')}</button></p>
        </div>
      )}
      {error && <p className="notice notice--bad" role="alert">{error}</p>}
      <section className="card">
        <h2>{t('Nuovo token')}</h2>
        <form onSubmit={create} className="form-inline">
          <label className="fld"><span className="fld__label">{t('Nome')}</span><input value={f.name} onChange={set('name')} maxLength={100} placeholder="Claude" required /></label>
          <label className="fld"><span className="fld__label">{t('Autore degli articoli')}</span>
            <select value={f.userId} onChange={set('userId')}>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
          <label className="fld"><span className="fld__label">{t('Scade dopo (giorni)')}</span><input type="number" min="1" max="730" value={f.days} onChange={set('days')} placeholder={t('senza scadenza')} /></label>
          <button className="btn btn--primary" disabled={busy}>{t('Crea token')}</button>
        </form>
      </section>
      <section className="card">
        <h2>{t('Token')}</h2>
        {tokens.length === 0 ? <p className="muted">{t('Nessun token.')}</p> : (
          <table className="table">
            <thead><tr><th>{t('Nome')}</th><th>{t('Autore')}</th><th>{t('Stato')}</th><th>{t('Scadenza')}</th><th>{t('Ultimo uso')}</th><th /></tr></thead>
            <tbody>{tokens.map((x) => (
              <tr key={x.id}>
                <td>{x.name} <span className="muted"><code>{x.prefix}…</code></span></td>
                <td>{x.user}</td>
                <td>{state(x)}</td>
                <td>{x.expires ?? t('mai')}</td>
                <td>{x.lastUsed ? `${x.lastUsed}${x.lastIp ? ` · ${x.lastIp}` : ''}` : t('mai')}</td>
                <td>{x.revoked
                  ? <button type="button" className="link" disabled={busy} onClick={() => act(deleteApiTokenAction, x.id)}>{t('Elimina')}</button>
                  : <button type="button" className="link" disabled={busy} onClick={() => act(revokeApiTokenAction, x.id, t('Revocare il token «{name}»? Chi lo usa non potrà più inviare articoli.', { name: x.name }))}>{t('Revoca')}</button>}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>
      <section className="card">
        <h2>{t('Come si usa')}</h2>
        <pre className="code-sample">{`curl -X POST ${endpoint || 'https://tuosito.ch/api/posts'} \\
  -H "Authorization: Bearer atn_…" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Titolo dell'articolo",
    "text": "Primo paragrafo.\\n\\n## Un titolo\\n\\nTesto con **grassetto** e un [link](https://esempio.ch).",
    "image": { "data": "<immagine in base64>", "filename": "foto.jpg", "alt": "Descrizione" }
  }'`}</pre>
        <ul>
          <li>{t('title e text sono obbligatori; image è facoltativa (JPG, PNG o WebP in base64).')}</li>
          <li>{t('Il testo è in markdown semplice: paragrafi, titoli (#), elenchi (- e 1.), citazioni (>), **grassetto**, *corsivo* e [link](https://…). Nessun HTML.')}</li>
          <li>{t('Risposta: 201 con la chiave dell\'articolo. L\'articolo è una bozza in Articoli.')}</li>
          <li>{t('Limiti: 20 articoli all\'ora per token (API_POSTS_PER_HOUR) e 10 tentativi sbagliati ogni 15 minuti per indirizzo.')}</li>
        </ul>
      </section>
    </>
  );
}
