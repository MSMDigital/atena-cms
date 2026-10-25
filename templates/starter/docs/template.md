# Creare un template

Starter è anche la libreria standard dei moduli: vedi `docs/catalogo-componenti.md`.

Un template è una cartella (poi uno zip) con questo contenuto. Il modo più veloce per cominciare è copiare questo template (`templates/starter`) e cambiare i file.

```
template.json       id, nome, versione, engine: 1
tokens.json         colori, caratteri, dimensioni, pulsanti di partenza (si cambiano poi da Admin → Stile)
schema/blocks.json  i blocchi: uno schema JSON ciascuno ($id = .../blocks/<tipo>.json, properties.type.const = <tipo>)
schema/site.json    campi in più dei dati del sito (menu, marchio, testi fissi...)
schema/page.json    campi in più delle pagine (facoltativo)
ui.json             testi dell'editor: descrizione dei blocchi, etichette dei campi
render/index.mjs    l'HTML: export default { renderPage(ctx, page) }
assets/             css, js, font, immagini → /assets/ nel sito
content/            contenuti di esempio: site.json, shared.json, pages/*.json (home.json obbligatoria)
```

## Il motore e il template

Il **motore** (il CMS) gestisce: admin, database, login, immagini, moduli e richieste, email, consenso, pubblicazione, sanificazione dei testi. Il **template** decide come appare il sito e quali blocchi esistono.

- Gli schemi dei blocchi usano le definizioni comuni del motore (`https://atena.cms/schema/common.json#/$defs/text`, `richInline`, `richBlock`, `image`, `link`, `pageKey`, ...). Vedi `templates/starter/schema/blocks.json` per esempi completi.
- Il motore aggiunge da solo ai dati del sito: `siteUrl`, `locales`, `seo`, `consent`, e i testi fissi per il consenso alla mappa (`mapConsentText`, `mapShowButton`, `mapManageButton`, `mapOpenLink`, `cookiePreferences`: **vanno nei contenuti di esempio**).
- Un blocco di tipo `form` con `fields` e `delivery` (`recipients`, `subject`) è un modulo: il motore lo riconosce, salva le richieste e manda le email.

## Il codice: `render/`

`renderPage(ctx, page)` riceve il contesto e la pagina e restituisce una **stringa** (il documento HTML). Gira in un **processo isolato**: niente file, rete, database, processi, variabili d'ambiente. Regole del pacchetto:

- si importa solo `@cms/kit` (strumenti del motore: `html`, `raw`, `attr`, `sanitizeRich`, `mapEmbed`, `consentHead`, `preferencesLink`, `engineScript`, `robotsMeta`, `trackingHead`, `trackingCss`, `trackingBodyStart`, `trackingBodyEnd`, ...) e i file della propria cartella `render/`; niente `node:fs`, `process`, `eval`, `import()` calcolati;
- i testi del contenuto vanno **sempre** tramite il tag `html` (escapa da solo). Solo `ctx.rich()` produce HTML dal contenuto, già sanificato;
- il contesto: `ctx.t(testo)` (testo nella lingua), `ctx.rich(testo)`, `ctx.link(link)`, `ctx.pathOf(chiave)`, `ctx.urlOf(chiave)`, `ctx.site`, `ctx.shared`, `ctx.locale`, `ctx.tag`, `ctx.meta` (percorso dei font, attributi di `<html>`), `ctx.assetImg(file)`, `ctx.imageSize(file)` (larghezza e altezza per `width`/`height`).
- ogni pagina ha già `title`, `description`, `ogImage`, `ogType`, `noindex`, `noai` (SEO/GEO): il template chiama `robotsMeta(page)` per il tag `<meta name="robots">` e usa `page.ogType ?? 'website'` per `og:type`; non li ridefinisce (sono campi riservati al motore, come `siteUrl`, `geo`, `tracking`... vedi la lista completa in `lib/template-install.mjs`);
- i dati del sito hanno già `geo.llmsText` e `tracking.{css,headCode,bodyStartCode,bodyEndCode}` (Dati del sito → GEO / Analytics e script esterni, solo un admin li scrive): il template chiama `trackingHead(ctx)` in cima a `<head>`, `trackingCss(ctx)` alla fine (dopo il CSS del template), `trackingBodyStart(ctx)` subito dopo `<body>` e `trackingBodyEnd(ctx)` subito prima di `</body>` — vedi `render/index.mjs` di questo template;
- il catalogo dei blocchi ha già, senza doverlo definire, un blocco **"Codice HTML"** (`type: "html"`, un campo `html` di codice libero, come `"shared"` è il riferimento a un blocco condiviso): basta aggiungere `html: (ctx, b) => html\`<section ...>${raw(b.html)}</section>\`` al proprio `render/blocks.mjs` (vedi questo template) per farlo comparire nell'editor.

Moduli e mappa con consenso: usa il markup previsto (vedi `render/blocks.mjs` di questo template) e aggiungi `${engineScript()}` a fine `<body>`: lo script del motore fa il resto.

## Provare e pacchettizzare

```sh
npm run validate -- --template starter      # controlla i contenuti di esempio contro gli schemi
npm run build -- dist-prova --template starter   # costruisce il sito (in un processo isolato)
npm run template:pack -- templates/starter       # controllo completo + zip da caricare in Admin → Template
```

`template:pack` fa gli stessi controlli dell'installazione (manifest, token, schemi, importazioni, contenuti, prova di esecuzione di tutte le pagine).
