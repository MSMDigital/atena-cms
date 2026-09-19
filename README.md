# Outsmart CMS

CMS interno Outsmart, **installabile in autonomia** e separato dai siti: il CMS è il **motore** (admin, database, login, immagini, moduli, pubblicazione) e ogni sito è un **template** che si installa a parte.

- **Installare il CMS**: [INSTALL.md](INSTALL.md) (procedura guidata nel browser: database, primo admin, template).
- **Provare in locale** (istanza di sviluppo, installazione da zero, prove automatiche): [docs/prova-in-locale.md](docs/prova-in-locale.md) · PDF con il brand Outsmart: [docs/guida/Outsmart-CMS-Prova-in-locale.pdf](docs/guida/Outsmart-CMS-Prova-in-locale.pdf) (si rigenera con `node docs/guida/build.mjs`).
- **Motore e template, contratto e sicurezza**: [docs/architettura.md](docs/architettura.md).
- **Creare un template**: [templates/starter/docs/template.md](templates/starter/docs/template.md) (`templates/starter` è il punto di partenza; `templates/mammano` è il sito Mammano Traslochi, con 15 blocchi).

Struttura del progetto:

```
app/ lib/ schema/ render/ migrations/ scripts/ tests/   il motore
templates/mammano/   template: sito Mammano Traslochi (assets, content, blocchi, HTML; tools/ = strumenti di sviluppo, non entrano nello zip)
templates/starter/   template minimo e commentato
data/                stato dell'installazione (template attivo, chiave, copie di sicurezza): fuori da git
```

Comandi dei template: `npm run template:pack -- templates/<id>` (controllo completo + zip), e con `--template <id>` gli script `validate`, `build`, `tokens`.

> Le sezioni seguenti descrivono il sito di esempio **Mammano**. I file che nominano (`assets/`, `content/`, `tokens.json`, `reference/`, `docs/catalogo-componenti.md`, `render/blocks.mjs`...) stanno ora in `templates/mammano/` (i blocchi in `schema/blocks.json` come JSON, l'HTML in `render/`); gli strumenti di confronto con il prototipo (`import`, `compare`, `shots`, `diff`) in `templates/mammano/tools/`. Il motore ne usa le parti generiche: `render/html.mjs`, `context.mjs`, `sanitize.mjs`, `consent.mjs`, `build.mjs`, `host.mjs`.

## Stato

Fatto: motore e template separati (template a pacchetto, HTML eseguito in un processo isolato, installazione da zip dall'admin, procedura guidata di installazione), contratto dei token + CSS + font in locale, schemi, renderer e build del sito statico, database, accesso ed editor di stile, pagine e blocchi, libreria immagini, moduli e richieste, email, consenso alla mappa (integrato e iubenda), revisione di sicurezza.

## Come funziona lo stile

- `tokens.json`: **unica** cosa che l'admin modifica. Colori (brand, tinta su scuro, WhatsApp), 3 superfici (`light`, `dark`, `brand`), scala tipografica h1-h6 + lead/body/small/xs/micro, dimensioni display, font titoli e corpo, pulsanti (raggio, altezza, effetto).
- `npm run tokens`: genera `assets/css/tokens.css`, `assets/css/fonts.css` e `tokens.meta.json` (font da precaricare, attributi `<html>`). Le dimensioni sono `size: [px su mobile 390, px su desktop 1440]` con `max` opzionale (tetto oltre 1440); il `clamp()` lo calcola il generatore.
- Font in locale: il generatore scarica da Google Fonts un file woff2 per famiglia e sottoinsieme (`subsets`) in `assets/fonts/` e scrive `fonts.css`. Si riscarica solo se cambiano famiglie, pesi o sottoinsiemi. Il visitatore non fa richieste a terzi.
- `assets/css/site.css`: CSS unico dei componenti. Usa solo `var()`: ogni sezione dichiara `data-surface="light|dark|brand"` e i colori arrivano dalla superficie.
- Effetto pulsanti: `<html data-btn-fx="arrow|fill|lift|none">`, generato da `buttons.effect`.
- Le dimensioni "display" (titolo hero, nastro, elenco servizi, split, CTA e parola verticale, zone, citazione, claim del footer, numeri) sono regolabili come la scala h1-h6: `typography.display.<nome>` → `--fs-display-<nome>`. Restano fisse solo la didascalia della galleria e le spaziature.
- `styleguide.html`: tutti i livelli di testo e i pulsanti sulle 3 superfici.

## Contenuti e schemi

- `docs/catalogo-componenti.md`: i 15 blocchi, i dati globali e le decisioni, a parole.
- `schema/`: gli schemi (JSON Schema 2020-12, scritti con helper JS). Fonte di verità di campi, etichette, valori ammessi e regole. `common.mjs` (testi per lingua, immagini, link, pulsanti, testata di sezione), `blocks.mjs` (i blocchi), `index.mjs` (pagina, blocchi condivisi, dati del sito, validatori Ajv).
- `content/`: `site.json` (azienda, navigazione, footer...), `shared.json` (blocchi condivisi), `pages/<chiave>.json` (una pagina = lista ordinata di blocchi). Testi per lingua `{ it, de, fr }`.
- `npm run import`: rigenera `content/pages` e `shared.json` dall'HTML del prototipo. Si ferma con un errore se trova una sezione che il catalogo non copre. `site.json` è scritto a mano.
- `npm run validate`: valida tutto contro gli schemi e controlla la coerenza tra i file (pagine e ancore a cui i link puntano, blocchi condivisi, id univoci). Gli avvisi sono link a pagine che non esistono ancora.

## Rendering e pubblicazione

- `render/`: funzioni pure che trasformano i contenuti in HTML (`html.mjs` template con escaping automatico, `context.mjs` lingua/URL/link, `blocks.mjs` un renderer per blocco, `chrome.mjs` head/header/footer, `jsonld.mjs`, `page.mjs`). Nessuna dipendenza. Producono lo stesso markup del prototipo, quindi CSS e JS esistenti funzionano invariati.
- `npm run build`: valida i contenuti e scrive `dist/` (un `index.html` per pagina e lingua, asset, `sitemap.xml`, `robots.txt`). Con contenuti non validi non pubblica nulla. Gli asset hanno percorsi con radice `/`: il sito va servito dalla radice del dominio.
- `npm run serve`: serve `dist/` su http://localhost:4173.
- Il sito pubblico è HTML statico, senza React né idratazione: `fx.js` modifica il DOM dopo il caricamento e un framework in idratazione entrerebbe in conflitto. Next.js servirà per l'admin, che potrà usare le stesse funzioni per l'anteprima.
- I valori che nel prototipo stavano nel JS ora arrivano dai dati come attributi `data-*`: parola della CTA, scritta della galleria, anteprime dell'elenco servizi, testi del menu mobile.

## Admin

Next.js (App Router) + MySQL. Oggi permette di: accedere, vedere lo stato dei contenuti, **modificare lo stile**, **creare ed eliminare pagine**, **modificare pagine, blocchi condivisi e dati del sito** (tutto con anteprima dal vivo), salvare la bozza e **pubblicare** (costruisce il sito in `dist/`).

Avvio in locale (serve Docker):

```sh
npm run env:init        # crea .env con password casuali (mai in git)
npm run db:up           # MySQL 8.4 in Docker, porta 3307
npm run db:migrate      # crea le tabelle
npm run db:seed         # importa tokens.json e content/ nel database
npm run admin:user -- --email tu@esempio.ch --name "Il tuo nome"   # crea l'admin, mostra la password una volta
npm run dev             # http://localhost:3000/admin
```

- **Bozza e pubblicato.** Ogni documento (token, dati del sito, blocchi condivisi, pagine) ha una bozza e una versione pubblicata. Salvare non cambia il sito; "Pubblica" costruisce tutto in una cartella temporanea e la mette online solo se la costruzione riesce, altrimenti non cambia nulla e l'errore è registrato in `publications`. Ogni salvataggio e pubblicazione lascia una revisione in `doc_revisions`.
- **Anteprima.** `/admin/preview/...` rende le pagine con le bozze; l'editor invia i valori correnti (anche non salvati) all'iframe con `postMessage`. Le famiglie di font nuove si vedono in anteprima da Google Fonts e vengono scaricate in locale alla pubblicazione (cache in `.cache/fonts`).
- **Ruoli.** `admin` fa tutto; `editor` non vede stile e dati del sito.
- **Database.** Schema in `migrations/`. I JSON stanno in colonne `LONGTEXT` (non `JSON`), così il comportamento è identico su MySQL e MariaDB (su Infomaniak i database sono in genere MariaDB).
- **Sicurezza.** Password con scrypt e sale; nel cookie c'è il token, nel database solo il suo SHA-256; cookie `httpOnly`, `SameSite=Lax`, `Secure` se `APP_ORIGIN` è https; limite di 5 errori in 15 minuti per email (e 20 per indirizzo solo con `TRUST_PROXY=1`); stesso messaggio e stesso tempo per email inesistente e password errata; redirect solo verso `/admin`; i token vengono validati con forme sicure prima di finire nel CSS; gli asset dell'anteprima non escono da `assets/`.
- **Test.** `npm test` (184 test: token, password, sessioni, documenti, pubblicazione, validazione, form generati dagli schemi, permessi delle azioni, libreria immagini, moduli, impostazioni email, consenso, sicurezza, installazione e cambio di template con ripristino; usa un database `outsmart_cms_test` separato, creato e distrutto ogni volta). `scripts/e2e-admin.mjs` (accesso, stile) e `scripts/e2e-editor.mjs` (pagine, blocchi, conflitti, pubblicazione, ruolo editor) e `scripts/e2e-media.mjs` (libreria immagini) `scripts/e2e-install.mjs` (installazione da zero, gestione dei template, anteprima isolata e ADMIN_HOSTS: 17 passi, database e cartelle temporanei), `scripts/e2e-consent.mjs` (consenso alla mappa: solo sito statico, non servono app né database; prova che Google non riceva richieste prima del consenso) `scripts/probe-security.mjs` (`npm run probe:security`: attacca l'app in esecuzione, 55 controlli) e `scripts/e2e-forms.mjs` (moduli: sito statico, salvataggio, email su un server SMTP di prova, elenco nell'admin; serve l'app avviata con `SMTP_HOST=127.0.0.1 SMTP_PORT=2525 MAIL_FROM=...`) sono prove end-to-end con un browser vero: servono un server attivo e un utente admin; salvano e pubblicano davvero e alla fine ripristinano il database ai file originali (`db:seed -- --force`).
- **Non ancora provato:** deploy su Infomaniak (Node.js Hosting): servono le variabili di `.env.example`, `TRUST_PROXY=1` dietro il proxy, e `SITE_OUT_DIR` puntato alla cartella servita.

### Editor di pagine e blocchi

- **Form generati dagli schemi.** Nessun campo è scritto a mano per un blocco: `lib/schema-form.mjs` interpreta lo schema (tipo di campo, valori iniziali, campi visibili, riassunto di un elemento) e `app/admin/(shell)/_editor/SchemaForm.jsx` lo disegna. Un blocco nuovo nel catalogo compare nell'editor senza toccare la UI. `title`, `description` e `default` dello schema diventano etichette, aiuti e valori iniziali; `x-when` (es. `{ layout: ['cards'] }`) mostra un campo solo per gli aspetti pertinenti.
- **Campi.** Testi per lingua (con formattazione limitata: grassetto, corsivo, link a pagine e contatti, a capo; nel Testo ricco anche titoli h2-h6, elenchi, citazioni), immagini con punto focale cliccabile (desktop e mobile), link (pagina, indirizzo, ancora, contatto), elenchi riordinabili con nascondi, duplica, elimina, unioni (immagine o citazione, elenco o tabella), blocchi condivisi. Gli errori dello schema compaiono accanto al campo, in italiano.
- **Anteprima.** L'iframe mostra la pagina con le modifiche **non ancora salvate** (`previewDocAction`): la bozza incompleta non manda in errore l'anteprima, che tiene l'ultima versione valida. La posizione di scorrimento si conserva.
- **Bozza incompleta.** Si può salvare anche con problemi; una pagina in stato "Bozza" non blocca la pubblicazione del resto del sito (i suoi problemi sono avvisi). Una pagina "Pubblicata" con errori sì: `npm run validate` e la pubblicazione li elencano.
- **Modifiche concorrenti.** Ogni documento ha una revisione (`docs.rev`): se due persone lavorano sulla stessa pagina, chi salva per secondo riceve un conflitto e non sovrascrive.
- **Pagine.** Si creano in bozza. Si eliminano solo se nessuno le usa (menu, link, pagine figlie); una pagina già pubblicata sparisce dal sito alla pubblicazione successiva. La chiave non si cambia, l'indirizzo sì. Due pagine online non possono avere lo stesso indirizzo e un ciclo tra pagine padre è un errore.
- **Ruoli.** L'editor modifica pagine e blocchi condivisi; dati del sito, stile, pubblicazione ed eliminazione sono solo dell'admin. Il controllo sta nelle azioni server (`tests/actions-auth.test.mjs` verifica che nessuna ne sia priva).

### Libreria immagini

- **Dove stanno.** Le immagini del progetto sono in `assets/img/` (nel repository); i caricamenti in `MEDIA_DIR` (default `media/`, fuori da git e da `dist/`), sotto `uploads/`. Per il resto del sistema sono un'unica libreria con percorsi logici (`hero-mammano.jpg`, `uploads/foto-1a2b3c4d5e.webp`); la tabella `media` si allinea ai file a ogni apertura (`syncMedia`). I file spariti restano in tabella come "mancanti": se una pagina li usa si vede.
- **Caricamento** (`/admin/media`, e dal selettore dentro l'editor). Il tipo si riconosce dai byte iniziali, non da nome o Content-Type; libvips può usare solo i decodificatori JPEG, PNG e WebP (niente SVG, TIFF, HEIF, GIF); oltre 50 megapixel si rifiuta (una PNG di colore uniforme pesa poco ma occupa gigabyte da decodificare); il file viene sempre ricodificato in WebP (massimo 2400 px, orientamento EXIF applicato, **metadati e posizione GPS tolti**); il nome lo decide il server (`slug-hash.webp`), quello originale resta solo come informazione. Limite `MAX_UPLOAD_MB` (default 10). La route controlla sessione e `Origin` (contro le richieste da altri siti).
- **Pubblicazione.** In `dist/` finiscono solo le immagini usate da pagine pubblicate, dati del sito e blocchi condivisi: un caricamento non ancora inserito non diventa pubblico. Se una pagina pubblicata usa un'immagine che non esiste, la pubblicazione si ferma **prima** di toccare il sito online. Larghezza e altezza (`width`/`height` nell'HTML) si leggono anche dai WebP.
- **Eliminazione.** Solo per i caricamenti, e solo se nessuna bozza né versione online li usa; le immagini del progetto non si eliminano dall'admin. Il testo alternativo predefinito dell'immagine viene proposto quando la si inserisce in una pagina e si può cambiare caso per caso.
- **Node.** `sharp` richiede Node ≥ 20.9 (`.nvmrc` indica 22).

### Moduli e richieste

- **Percorso.** Il modulo del sito statico invia con `fetch` un JSON a `/api/forms/<id del blocco>` (`app/api/forms/[id]/route.js`, logica in `lib/forms.mjs`). In produzione un proxy deve mandare `/api/` e `/admin/` all'app Node e il resto ai file statici; in locale `npm run serve` fa lo stesso (`FORMS_PROXY`, default `http://localhost:3000`). L'indirizzo si può cambiare in Sito → "Indirizzo che riceve le richieste" (per un dominio diverso servono `APP_ORIGIN` o `FORM_ALLOWED_ORIGINS`, che abilitano anche il CORS).
- **Cosa si fida del client: quasi niente.** Il modulo si cerca tra quelli **pubblicati** (in bozza non riceve nulla); si tengono solo i campi che il modulo definisce e si validano di nuovo (obbligatori, email, telefono, data, opzioni delle tendine, consenso, lunghezze, caratteri di controllo); **destinatari e oggetto vengono dal modulo**, mai dalla richiesta. Corpo massimo 32 KB, solo `application/json`, controllo dell'`Origin`.
- **Contro gli automatismi.** Un campo esca nascosto (aggiunto dallo script) e il tempo di compilazione (sotto 1,2 s si risponde "ok" senza salvare, così il bot non impara nulla); stessa richiesta identica entro 10 minuti = una sola; al massimo 5 richieste all'ora per indirizzo (solo con `TRUST_PROXY=1`, e l'indirizzo si conserva solo come impronta SHA-256 salata con `IP_HASH_SECRET`) e 60 all'ora per modulo. Nessun captcha: se serve, il punto in cui inserirlo è `handleSubmission`.
- **Salvataggio ed email.** La richiesta si salva **sempre** in `form_submissions` prima di tutto; l'email parte dopo (`lib/mail.mjs`, nodemailer, solo testo) e se fallisce la richiesta resta con l'errore, visibile e rinviabile dall'admin. Mittente `MAIL_FROM` (un indirizzo del dominio autorizzato dal server SMTP), chi scrive va in Reply-To. Il server SMTP si imposta da **Admin → Email** (vedi sotto); in mancanza valgono le variabili `.env` (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`); senza nessuna delle due l'esito è "Non configurata".
- **Admin** (`/admin/requests`, badge con le nuove nel menu). Elenco filtrabile (nuove, lette, archiviate), dettaglio con le etichette del modulo, stato, invio dell'email ripetuto. L'eliminazione definitiva è solo dell'admin. Non si registrano user agent né indirizzi IP in chiaro.
- **Dati personali.** Le richieste restano finché qualcuno non le elimina: la durata di conservazione va decisa con il titolare (informativa privacy, nLPD/GDPR).
- **Se lo schema cambia.** `formError` è un nuovo testo fisso obbligatorio: in un database già esistente il documento "Sito" lo richiede al prossimo salvataggio (in sviluppo: `npm run db:seed -- --force`).

### Impostazioni email (Admin → Email, solo admin)

- **Cosa si imposta.** Server SMTP, tipo di connessione (STARTTLS, SSL/TLS, nessuna: la porta si adegua), utente, password, indirizzo e nome del mittente. Ogni campo è validato (il server è solo un nome di host, niente `http://` né percorsi; mittente e nome senza caratteri che potrebbero aggiungere intestazioni alle email). Due pulsanti in più: **Invia email di prova** (con le impostazioni salvate, all'indirizzo che scegli) e **Rimuovi le impostazioni salvate** (si torna a `.env`).
- **La password è cifrata.** Nel database sta cifrata con AES-256-GCM; la chiave è `SETTINGS_SECRET` in `.env`, **non** nel database, quindi una copia del database da sola non la rivela (`npm run env:init` la genera; su un `.env` già esistente va aggiunta a mano). Al browser la password non arriva mai: la pagina sa solo se c'è; lasciando vuoto il campo si tiene quella salvata. Se `SETTINGS_SECRET` cambia la password non si decifra più: l'admin lo dice e va reinserita (l'invio fallisce con un errore chiaro invece di partire senza accesso). Senza `SETTINGS_SECRET` la pagina rifiuta di salvare una password.
- **Precedenza.** Impostazioni salvate → variabili `.env` → nessun invio (la richiesta si salva comunque).
- **Da tenere presente.** Chi ha il ruolo admin sceglie il server a cui il CMS si connette (e con "email di prova" può farlo provare): è una funzione da admin di fiducia, non da editor.

### Pagine legali

- `privacy`, `note-legali` e `cookie` (in `content/pages/`, blocchi Intestazione + Testo ricco) sono **testi dimostrativi** costruiti sui dati di Mammano e su come il sito funziona oggi (modulo di preventivo, nessun cookie proprio, mappa Google). Non sono un parere legale: vanno riletti e completati dal titolare o da un consulente.
- Le parti da completare sono in grassetto tra parentesi quadre (`[DA COMPLETARE: ...]`, `[DA CONFERMARE: ...]`, `[DA VERIFICARE: ...]`). Il controllo dei contenuti (`npm run validate` e la pubblicazione) le elenca come **avvisi**: non bloccano, ma finché ci sono, il testo non è pronto per il pubblico.
- Il testo sui cookie descrive la mappa come caricata solo dopo il consenso: ora è vero (vedi sotto). Se si passa a iubenda va riletto, perché iubenda salva un proprio cookie tecnico con la scelta.

### Consenso ai contenuti di terzi (la mappa) e iubenda

- **Oggi l'unico contenuto di terzi è la mappa di Google** (blocco Contatti). Non si carica mai da sola: al suo posto c'è un riquadro con il testo del consenso, il pulsante e un link normale "Apri in Google Maps". In `Sito → Consenso ai contenuti di terzi` si sceglie come gestire il consenso:
  - **Integrata** (predefinita): il clic su "Mostra la mappa" assegna l'indirizzo all'iframe. Nessun cookie, nessun servizio esterno, nessuna memoria della scelta (a ogni visita si riclicca). Non serve un banner perché il sito non imposta cookie.
  - **iubenda**: si inseriscono `siteId` e `cookiePolicyId` (solo numeri, dal codice di installazione di iubenda). Il sito genera da sé il codice: nell'`<head>` la configurazione `_iub.csConfiguration` (con `lang` della pagina e `storage.useSiteId`) e lo script `https://cdn.iubenda.com/cs/iubenda_cs.js`; la mappa segue il blocco manuale della guida di iubenda (`class="_iub_cs_activate"`, `data-iub-purposes="3"` cioè "Esperienza", `suppressedsrc`, `src="about:blank"`); il riquadro ha il pulsante "Gestisci le preferenze" (classe `iubenda-cs-preferences-link`) e nel footer compare "Preferenze cookie". Il nostro script si accorge da solo quando iubenda dà l'indirizzo all'iframe e mostra la mappa al posto del riquadro. Non si incolla codice libero: un campo che accettasse script sarebbe una porta per iniettarne.
  - Se manca uno dei due numeri il sito ricade sull'integrata, mai su un banner a metà. L'anteprima dell'admin non carica mai gli script di iubenda.
- **Cosa NON è stato provato: il servizio iubenda vero.** La prova end-to-end usa uno script finto che ripete quanto dice la guida; dimostra che il nostro markup e il nostro JavaScript rispettano quel contratto (Google non riceve nulla prima del consenso, la mappa compare dopo, senza iubenda il riquadro resta e il link funziona), non che iubenda si comporti così sul sito reale. Prima di andare online, con l'account iubenda vero: (1) inserire i due numeri e pubblicare; (2) controllare che il banner compaia e che, rifiutando, la mappa resti bloccata; (3) accettando, che la mappa si carichi; (4) che "Preferenze cookie" riapra le preferenze; (5) nel pannello iubenda, che il consenso **per categoria** sia attivo e la categoria "Esperienza" presente (senza, `data-iub-purposes` viene ignorato).
- **Non incluso.** Lo script `stub.js` (serve solo al TCF per la pubblicità) e il blocco automatico di iubenda (`cs.iubenda.com/autoblocking/<siteId>.js`). Se un domani il sito userà altri strumenti di terzi (statistiche, pixel), ognuno andrà etichettato allo stesso modo (o si attiverà il blocco automatico) e la pagina cookie aggiornata. iubenda può anche ospitare le informative (privacy e cookie policy): le tre pagine legali di questo sito restano testi propri.
- **Se lo schema cambia.** Cinque nuovi testi fissi (`mapConsentText`, `mapShowButton`, `mapManageButton`, `mapOpenLink`, `cookiePreferences`) e l'impostazione `consent` (facoltativa: senza vale l'integrata). In un database già esistente il documento "Sito" chiede i testi al prossimo salvataggio (in sviluppo: `npm run db:seed -- --force`).

### Sicurezza

Revisione del 19 settembre 2026: tre controlli statici indipendenti del codice (autenticazione e permessi; iniezioni e contenuti; endpoint pubblici, upload e segreti) più una sonda dinamica sull'app in esecuzione (`npm run probe:security`). Le correzioni sono coperte da `tests/security.test.mjs`, dalla sonda e dalle prove con il browser.

- **Testi ricchi (era il problema più grave).** Un editor poteva salvare HTML pericoloso (`<script>`, `onerror`, link `javascript:`) e l'anteprima lo eseguiva con la sessione di un admin. Ora: (1) il **server rifiuta** al salvataggio i testi con HTML non ammesso (`lib/content-guard.mjs`); (2) **ogni uscita sanifica** (`render/sanitize.mjs`: solo i tag ammessi, senza attributi, `href` solo `page:`, `channel:`, `https:`, `mailto:`, `tel:`, `#`, con controllo anche sulle entità nascoste): vale per il sito, l'anteprima e l'editor; (3) lo schema non accetta più `javascript:` né in `link.url` né nei testi; (4) l'admin ha una **Content-Security-Policy con nonce** (`middleware.js`): anche se un giorno un difetto lasciasse passare del codice, il browser non lo esegue, nemmeno nell'anteprima (che eredita la politica; lo script dell'anteprima è il file esterno `public/cms-preview.js`). La prova con il browser aggiunge uno script e un `onerror` alla pagina e all'anteprima e verifica che restino inerti.
- **Sito pubblico.** `fx.js` non usa più `innerHTML` con testi del contenuto; lo slug delle pagine è solo `[a-z0-9-]` (uno slug con `../` non può far scrivere fuori da `dist/`; la build lo controlla anche a valle); percorsi delle immagini con lo stesso vincolo; `siteUrl` senza schemi pericolosi ed escapato nella sitemap; lookup dei blocchi condivisi e delle pagine senza prototipo (`constructor`, `__proto__` non crollano più).
- **Permessi.** Destinatari e oggetto dell'email di un modulo li cambia **solo un admin** (chi li cambia riceve i dati personali); un editor non può aggiungere moduli. I controlli sulle chiavi verificano il tipo (un array non aggira più la protezione della home). Se cambiano server, porta, utente o cifratura delle impostazioni email, la password salvata non si riusa: va reinserita.
- **Accesso.** Il blocco per errori vale per **account + indirizzo** (5 in 15 minuti): un estraneo non chiude fuori il titolare da altri indirizzi; restano il limite per account da molti indirizzi (20) e per indirizzo (20). Il tentativo si registra **prima** di verificare la password (le richieste in parallelo non aggirano il limite), i tentativi bloccati non allungano il blocco, le verifiche scrypt sono al massimo 2 alla volta (coda limitata), password enormi rifiutate. Con `TRUST_PROXY=1` si legge l'**ultimo** valore di `X-Forwarded-For` (quello scritto dal proxy). **Senza proxy fidato l'indirizzo è ignoto e resta solo il limite per account**: in produzione serve `TRUST_PROXY=1`. Cookie `Secure` in produzione salvo installazioni dichiaratamente locali. Nuova pagina **Il mio account** (clic sul proprio nome): cambio password con quella attuale, minimo 12 caratteri, chiude le altre sessioni. `create-user --reset` non cambia più il ruolo.
- **Moduli pubblici.** Pulizia dei testi lineare (prima una regex poteva bloccare il server con 32 KB di spazi); conteggio e inserimento sotto lock (con richieste in parallelo il tetto di 60 all'ora non si supera); l'impronta dell'indirizzo si conserva solo con un sale dedicato (`IP_HASH_SECRET`); senza proxy fidato l'unico limite è quello per modulo, quindi **prima del lancio conviene un captcha** (Turnstile o simili: il punto è `handleSubmission`).
- **Upload.** `Content-Length` obbligatorio (senza, `formData()` metterebbe tutto in memoria), al massimo 2 elaborazioni insieme, tetto di spazio `MEDIA_QUOTA_MB`.
- **Pubblicazione.** Una alla volta (lock nel database, anche tra processi), cartella temporanea con nome unico, scambio con due `rename` (il sito non resta senza pagine).
- **Configurazione.** `ajv` era tra le dipendenze di sviluppo ma serve a runtime (con `--omit=dev` l'admin non partiva): corretto. Intestazioni su admin e API (`Permissions-Policy`, `Cross-Origin-Opener-Policy`, HSTS solo se `APP_ORIGIN` è https, `nosniff`, `Referrer-Policy`, `no-store`). `.gitignore` copre ogni variante di `.env`. Gli script che cancellano dati (prove end-to-end, sonda, `db:seed --force`) **rifiutano di partire se `DB_HOST` non è locale**. Il server locale `npm run serve` ascolta solo su 127.0.0.1 e non esce dalla cartella.
- **Pulizia dei dati.** `npm run purge` (da mettere in cron): elimina le richieste oltre `FORM_RETENTION_MONTHS`, le sessioni scadute, i vecchi tentativi di accesso e le versioni intermedie oltre le ultime 100 per documento.

**Rischi noti che restano (decisioni da prendere):**
- `postcss` incluso in Next 15 (`npm audit`: una vulnerabilità alta e una moderata). Riguarda l'elaborazione di CSS non fidato: qui Next lo applica solo al nostro CSS, quindi il rischio reale è basso; l'unica correzione proposta è Next 16 (aggiornamento non compatibile), da valutare a parte.
- Chi è admin sceglie il server SMTP a cui il CMS si connette e può farlo provare (in teoria: scansione di porte interne). Serve un admin di fiducia; non ho bloccato gli indirizzi privati perché rompe le prove e lo sviluppo in locale.
- Nessuna autenticazione a due fattori, nessuna scadenza per inattività (la sessione dura 7 giorni), nessuna funzione "esci da tutti i dispositivi" (il cambio password chiude però le altre sessioni). Con un admin che controlla pubblicazione e SMTP, il 2FA è la prossima misura sensata.
- La pubblicazione non mostra le differenze rispetto alla versione online: un admin che pubblica senza guardare accetta anche le modifiche di un editor (i destinatari dei moduli però non le può cambiare).
- `login_attempts` e `sessions` conservano indirizzo IP ed email digitata (7 giorni per i tentativi): dato personale, da coprire nell'informativa privacy.
- Il cookie di sessione non ha il prefisso `__Host-` (richiede https anche in sviluppo).
- La cifratura della password SMTP deriva la chiave con un SHA-256 semplice di `SETTINGS_SECRET`: va bene per un segreto casuale generato da `env:init`, non per una frase scelta a mano.

## Regressione visiva

`reference/` contiene le pagine statiche del prototipo (senza note interne) con i loro asset, congelate: sono l'oracolo del renderer. Non si modificano.

```sh
npm run compare                                       # DOM: reference/ contro dist/ (con --head anche titolo, meta, JSON-LD)
node scripts/shots.mjs reference <output>             # 9 pagine x (1440, 390) in modalità ?shot
node scripts/shots.mjs dist <output>                  # idem sul sito generato (server locale automatico)
node scripts/diff.mjs <prima> <dopo> --tol 10         # diff pixel, per fasce di 200 px
```

`assets/css/dev-shot.css` è solo per i test e viene iniettato dall'harness.

Stato: 9/9 pagine con DOM identico; pixel identici su mobile e entro lo 0,06% su desktop, solo nella fascia dell'header (il selettore lingua non compare con una sola lingua online).

## Decisioni (18 set 2026)

- Stack: Next.js. **Database: MySQL** (incluso in Infomaniak), una istanza per sito. Il multi-tenant può venire dopo.
- Tutto per lingua fin dall'inizio (il sito è IT/DE/FR).
- Dimensioni display regolabili dall'admin, font serviti in locale.
- Le liste di voci (punti, passi, card, righe) sono un solo blocco. Nastro condiviso, dati azienda in un punto solo, Testo ricco per le pagine legali, il modulo salva le richieste in MySQL.
- Niente note interne nei blocchi.
- Il sito pubblico è HTML statico generato da funzioni pure, non un'app React. Next.js serve per l'admin.
- Database MySQL 8.4 in sviluppo (Docker), portabile su MariaDB (provato su 11.4).

## Note

- `assets/js/*.js` (effetti di scroll, contatori, anteprima cursore) è ancora quello del prototipo e dipende dai nomi delle classi.
