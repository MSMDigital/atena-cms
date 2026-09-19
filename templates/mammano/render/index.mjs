// Punto d'ingresso dell'HTML del template: il CMS chiama renderPage(ctx, page) per ogni pagina e lingua, in un processo isolato
// (senza accesso a file, rete o database). ctx offre testi per lingua, indirizzi, link e dati del sito; gli helper del motore
// si importano da '@cms/kit'.
import { renderPage } from './page.mjs';

export default { renderPage };
