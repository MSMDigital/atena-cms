'use client';

// Lingua dell'admin per i componenti client: il dizionario inglese si scarica solo se serve (React `use` aspetta il caricamento, anche nel rendering sul server).
import { createContext, use, useContext, useMemo } from 'react';
import { makeT } from '@/lib/i18n.mjs';

const Ctx = createContext({ lang: 'it', t: makeT('it') });
let loading = null;
const loadEn = () => (loading ??= import('@/lib/i18n/en.mjs').then((m) => m.EN));

export function I18nProvider({ lang, children }) {
  const dict = lang === 'en' ? use(loadEn()) : null;   // in inglese si aspetta il dizionario (anche nel rendering sul server)
  const value = useMemo(() => ({ lang, t: makeT(lang, dict ?? {}) }), [lang, dict]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useT = () => useContext(Ctx).t;
export const useLang = () => useContext(Ctx).lang;
