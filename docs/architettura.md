# Architettura: motore e template

## Le tre parti

| Parte | Cosa fa | Dove |
|---|---|---|
| **Motore** (CMS) | admin, database, login e ruoli, libreria immagini, moduli e richieste, email, consenso, sanificazione, pubblicazione, installatore | `app/`, `lib/`, `schema/`, `render/`, `migrations/`, `scripts/` |
| **Template** | design, CSS/JS, blocchi (campi e HTML), stile di partenza, contenuti di esempio | `templates/<id>/` (cartella o zip) |
| **Dati del sito** | contenuti, stile modificato, richieste, utenti, immagini caricate | database, `media/`, `dist/` |

Il motore non contiene nulla di un sito in particolare. Con Mammano e con Starter (due template diversi, con blocchi diversi) il motore è lo stesso: la prova end-to-end `scripts/e2e-install.mjs` installa da zero, carica i due template, passa dall'uno all'altro e invia un modulo dal sito di ciascuno.

## Contratto tra motore e template (versione 1)

Un template è un pacchetto con: `template.json`, `tokens.json`, `schema/blocks.json` (+ `site.json`, `page.json`), `ui.json`, `render/index.mjs`, `assets/`, `content/`. La guida per crearne uno è in `templates/starter/docs/template.md`.

- **Schemi**: i blocchi sono JSON Schema (dati, non codice): il server li manda all'editor, che costruisce i moduli. Il motore compone lo schema completo: scheletro della pagina + blocchi del template; dati del sito = campi del motore (`siteUrl`, `locales`, `seo`, `consent`, testi fissi del consenso) + campi del template.
- **HTML**: `renderPage(ctx, page)` restituisce una stringa. Il motore chiama il template una volta per pagina e lingua; i dati arrivano via messaggi, gli strumenti si importano da `@cms/kit`.
- **Moduli**: un blocco `form` (con `fields` e `delivery`) è riconosciuto dal motore; il markup segue il contratto (`form[data-form][data-endpoint]`, `.form-grid`, `.form-success`, `.form-error`) e lo script del motore (`/assets/cms/cms.js`) fa invio e anti-bot.
- **Mappa con consenso**: `mapEmbed` del kit produce il riquadro/iframe secondo la modalità scelta in Sito → Consenso (integrata o iubenda).
- **Stile**: il modello dei token (colori, 3 superfici, scala h1-h6, dimensioni «display», pulsanti, layout) è del motore, uguale per tutti i template: un template può ignorare ciò che non usa. È il limite principale della versione 1; un modello di token diverso per template è il passo successivo.
- **Cosa il template non decide**: sanificazione dei testi ricchi, validazione dei moduli, destinatari delle email, cookie e consenso, sicurezza dell'admin.

## Template e sicurezza

Un template è **codice** caricato da uno zip. Difese, in ordine:

1. **Pacchetto**: lo zip è non fidato (percorsi, tipi di file per cartella, numero e dimensione dei file, rapporto di compressione, dimensione dei JSON); gli schemi si rifiutano se usano nomi riservati al motore o espressioni regolari a rischio di blocco (si accetta solo un sottoinsieme sicuro). Il controllo del codice di rendering (importazioni ammesse) è **solo un aiuto**: non è un confine di sicurezza, lo è il processo isolato.
2. **Prova prima dell'installazione**: manifest, token, schemi, contenuti di esempio ed **esecuzione di tutte le pagine** nel processo isolato.
3. **Processo isolato** (`render/host.mjs`, `render/child.mjs`): Node con il modello di permessi (`--permission`, o `--experimental-permission` sulle versioni più vecchie): nessuna scrittura, letture solo di `render/` del motore e del template, nessun processo figlio, nessun worker, nessun addon; ambiente vuoto (nessuna password o chiave); tempo massimo per richiesta, limiti sulla dimensione dell'HTML; il processo riparte se il template cambia o si blocca. I dati del sito gli arrivano via messaggio e non legge file.
4. **Chi può**: solo un admin, con conferma della password (limitata come l'accesso); ogni tentativo entra nel registro (`audit_log`, visibile in Admin → Template) con l'impronta (sha256) del file.
5. **Anteprima**: gira in un iframe con `sandbox="allow-scripts"` **senza** `allow-same-origin`, e la sua risposta ha la stessa restrizione nella politica di sicurezza. Il JavaScript del template nell'anteprima ha un'origine opaca: non legge l'admin né i suoi cookie. L'editor e l'anteprima dialogano solo per messaggi (`public/cms-preview.js`). L'HTML lo scarica l'editor con la sessione e lo passa all'iframe (`srcdoc`), così l'iframe non dipende dal cookie e non può caricare pagine dell'admin; senza sessione `/admin/preview` risponde 401.
6. **Contenuti**: qualunque cosa produca il template per un testo ricco passa dalla sanificazione se usa `ctx.rich`; per il resto il tag `html` escapa.

**Limiti dichiarati** (non aggirabili con questo modello; leggili prima di caricare template di terzi):

- **Rete e segnali**: il modello di permessi di Node **non limita la rete né i segnali**. Il processo isolato non ha segreti, ma un template malevolo può aprire connessioni verso l'esterno (con i dati, pubblici, del sito) e può **terminare il processo del server** (SIGTERM/SIGKILL al processo padre): è un blocco del servizio, non una fuga di dati. Il segnale SIGUSR1 (apertura del debugger) è neutralizzato dal motore. Per un isolamento vero serve il sistema operativo: `CMS_RENDER_WRAPPER` lancia il processo isolato dietro un comando a tua scelta, per esempio `["unshare","-Urn"]` (Linux: senza rete, con utente proprio) o `bwrap`. Sull'hosting condiviso non è di solito possibile.
- **JavaScript del template nel sito pubblico**: `assets/js` gira nel browser dei visitatori. Se il sito pubblico e l'admin stanno **sullo stesso dominio**, quel codice ha la stessa origine dell'admin e potrebbe agire con la sessione di un admin che visita il sito da collegato. Per questo si consiglia di aprire l'admin su un **indirizzo separato** (per esempio `admin.cliente.ch`) e di impostare `ADMIN_HOSTS`, così `/admin` e `/install` non esistono sul dominio del sito (risposta 404).
- **Il modello di permessi è «difesa in profondità»**, non un confine perfetto, ed è ancora in evoluzione tra le versioni di Node.
- **Regole di sicurezza pratiche**: installa solo template di cui ti fidi; l'installazione da zip nell'admin equivale a fidarsi dell'autore del template. Se i template li installi tu, spegni il caricamento con `ALLOW_TEMPLATE_UPLOAD=0` (le cartelle si copiano in `templates/`); l'installazione guidata resta disponibile.

## Dove sta cosa (percorsi)

- Template attivo: `data/active-template.json` (o `CMS_TEMPLATE` / `CMS_TEMPLATE_DIR` per gli script).
- Stato di installazione: `data/installed.json`; chiave di installazione: `data/install-token`.
- Template installati: `templates/<id>/`; scartati o sostituiti: `templates/.trash/` (ultimi 5); in prova: `templates/.staging/`.
- Copie di sicurezza dei contenuti (quando si sostituiscono con quelli di esempio): `data/backups/`.
