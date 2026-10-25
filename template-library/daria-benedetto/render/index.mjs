// Template "Starter": l'HTML delle pagine. Il CMS chiama renderPage(ctx, page) per ogni pagina e lingua, in un processo isolato
// (niente file, rete o database). `ctx` offre testi per lingua (ctx.t), testi ricchi (ctx.rich), indirizzi (ctx.link, ctx.pathOf, ctx.urlOf)
// e i dati del sito (ctx.site). Gli strumenti del motore si importano SOLO da '@cms/kit'.
import { renderPage } from './page.mjs';

export default { renderPage };
