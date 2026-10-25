// Lingua dell'admin per i componenti server e le azioni del server: una sola lettura delle impostazioni per richiesta.
import 'server-only';
import { cache } from 'react';
import { getGeneral } from './general.mjs';
import { makeT, normLang, localize } from './i18n.mjs';
import { EN } from './i18n/en.mjs';

export const getLang = cache(async () => normLang((await getGeneral()).cmsLanguage));
export const getT = cache(async () => makeT(await getLang(), EN));
// Traduce i messaggi di un risultato di azione (vedi localize in i18n.mjs).
export const loc = async (result) => localize(result, await getT());
