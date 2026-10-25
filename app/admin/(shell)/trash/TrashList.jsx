'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { restoreDocAction, purgeDocAction } from '../_editor/actions';
import { useT } from '@/app/admin/_i18n/I18nProvider';

const KIND = { page: 'Pagina', post: 'Articolo' };

export default function TrashList({ items, canManage }) {
  const t = useT();
  const router = useRouter();
  const [busy, start] = useTransition();
  const run = (fn, kind, key) => start(async () => { const r = await fn(kind, key); if (!r.ok) window.alert(t(r.error)); router.refresh(); });
  if (!items.length) return <p className="card muted">{t('Il cestino è vuoto.')}</p>;
  return (
    <section className="card">
      <table className="table">
        <thead><tr><th>{t('Tipo')}</th><th>{t('Nome')}</th><th>{t('Eliminato il')}</th><th>{t('Sul sito')}</th><th /></tr></thead>
        <tbody>
          {items.map((d) => (
            <tr key={d.id}>
              <td>{t(KIND[d.kind])}</td>
              <td>{d.name}</td>
              <td className="muted">{d.deletedLabel}</td>
              <td>{d.stillOnline ? <span className="tag tag--warn">{t('Online fino alla prossima pubblicazione')}</span> : <span className="tag">{t('No')}</span>}</td>
              <td>{canManage && (
                <span className="rowact">
                  <button className="btn" disabled={busy} onClick={() => run(restoreDocAction, d.kind, d.key)}>{t('Ripristina')}</button>
                  <button className="btn" disabled={busy} onClick={() => { if (window.confirm(t('Eliminare «{name}» per sempre? Non si può annullare.', { name: d.name }))) run(purgeDocAction, d.kind, d.key); }}>{t('Elimina per sempre')}</button>
                </span>
              )}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
