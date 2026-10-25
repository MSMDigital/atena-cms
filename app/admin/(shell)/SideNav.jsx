'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useT } from '@/app/admin/_i18n/I18nProvider';

// Menu laterale come quello di WordPress: voci con sottovoci, che si aprono per la sezione in cui ci si trova.
// item: { label, href, badge?, children?: [{ label, href, badge? }] }
export default function SideNav({ items }) {
  const t = useT();
  const path = usePathname();
  const params = useSearchParams();
  const hp = (h) => h.split('?')[0];
  const hq = (h) => new URLSearchParams(h.split('?')[1] ?? '');
  // Una voce è accesa se il percorso coincide e i suoi parametri (es. ?tipo=, ?gruppo=) coincidono con quelli dell'indirizzo corrente;
  // senza parametri, vale solo se l'indirizzo corrente non ne ha tra quelli che distinguono le voci sorelle.
  const KEYS = ['tipo', 'gruppo'];
  const at = (h) => {
    const p = hp(h);
    if (p === '/admin/pages' && /^\/admin\/pages\/404(--|$)/.test(path)) return false;   // la pagina 404 ha la sua voce in Impostazioni
    const base = p === '/admin' ? path === '/admin' : path === p || path.startsWith(`${p}/`);
    if (!base) return false;
    const q = hq(h);
    return KEYS.every((k) => (q.get(k) ?? (k === 'gruppo' && p === '/admin/site' ? 'generale' : null)) === (params.get(k) ?? (k === 'gruppo' && p === '/admin/site' ? 'generale' : null)));
  };
  // «Tutte le pagine» (/admin/pages) non deve restare accesa su /admin/pages/new, che ha la sua voce.
  const childOn = (c, siblings) => at(c.href) && !siblings.some((o) => o !== c && hp(o.href).startsWith(`${hp(c.href)}/`) && at(o.href));
  return (
    <nav className="sidenav" aria-label={t('Principale')}>
      {items.map((it) => {
        const kids = it.children ?? [];
        const open = at(it.href) || kids.some((c) => at(c.href));
        return (
          <div className={`sidenav__item${open ? ' is-open' : ''}${kids.length ? ' has-kids' : ''}`} key={it.label}>
            <Link href={it.href} className={open ? 'is-on' : undefined} aria-current={open && !kids.length ? 'page' : undefined}>
              {it.label}
              {it.badge > 0 && <span className="nav-badge" aria-label={t('{n} nuove', { n: it.badge })}>{it.badge}</span>}
            </Link>
            {kids.length > 0 && (
              <div className="sidenav__sub"><div>
                {kids.map((c) => <Link key={c.href} href={c.href} className={childOn(c, kids) ? 'is-on' : undefined} aria-current={childOn(c, kids) ? 'page' : undefined}>{c.label}{c.badge > 0 && <span className="nav-badge">{c.badge}</span>}</Link>)}
              </div></div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
