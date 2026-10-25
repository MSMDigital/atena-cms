# Installare Atena CMS

Il CMS è il **motore** (admin, database, login, immagini, moduli, pubblicazione). Il **sito** (design, blocchi, HTML, contenuti di esempio) è un **template**, che si installa a parte. Un'installazione = un sito = un database.

## Requisiti

- Node.js **22.12** o più recente (i template girano in un processo isolato che usa il modello di permessi di Node).
- MySQL 8 o MariaDB 10.6+ con un database **vuoto** e un utente che possa creare tabelle.
- Un utente del sistema che possa scrivere in: la cartella del progetto (per `.env`), `data/`, `templates/`, `media/` e nella cartella del sito pubblicato (`dist/`).
- Dietro un web server o un proxy: `/admin`, `/install` e `/api/` vanno all'app Node; tutto il resto è il sito statico (`dist/`). Se il tuo hosting non permette di configurare quell'instradamento, l'app può servire anche il sito pubblico da sé (vedi «Hosting condiviso» sotto).

## Passi

```sh
npm ci
npm run build:admin          # compila l'admin
npm start                    # avvia l'app (porta 3000)
```

1. Apri `https://<il-tuo-indirizzo>/install`. Ti chiede la **chiave di installazione**: la trovi nel log del server (riga «Chiave di installazione») e nel file `data/install-token`. Se preferisci sceglierla tu, imposta la variabile `INSTALL_TOKEN` (almeno 16 caratteri) prima di avviare.
2. **Requisiti**: la procedura controlla Node, `sharp` (immagini), il modello di permessi e le cartelle scrivibili.
3. **Database**: server, porta, nome, utente e password. La procedura prova la connessione, crea le tabelle e scrive il file `.env` (permessi 600) con le chiavi generate (`SETTINGS_SECRET`, `IP_HASH_SECRET`). Indica anche l'indirizzo con cui si apre l'admin e se l'app sta dietro un proxy.
   - La password del database non può contenere `$ ' " \ ` #` (il file `.env` non li conserva in modo affidabile).
4. **Primo admin**: nome, email, password (almeno 12 caratteri).
5. **Template**: scegli **Starter** (è già selezionato; è il template standard, con la libreria di moduli, l'header e il footer separati, il blog e la SEO/GEO). Indica l'indirizzo pubblico del sito. Si installano i contenuti di esempio e il sito viene pubblicato subito. Gli altri template (per esempio Daria Benedetto) non viaggiano con l'installer: stanno in `template-library/` e si caricano come zip (`npm run template:pack -- template-library/<id>`, poi Admin → Aspetto → Template o questo stesso passo).

Finito, `/install` si chiude per sempre e la chiave non serve più. Si accede da `/admin`.

## Installazione completa con Starter, passo per passo

Starter è il template con cui parte ogni sito nuovo. Questo è il percorso dall'inizio alla fine.

1. **Prepara il database**: uno vuoto (MySQL 8 o MariaDB 10.6+) e un utente che possa creare tabelle. Se lo fai in locale: `npm run env:init`, `npm run db:up` (Docker).
2. **Installa e avvia**: `npm ci`, `npm run build:admin`, `npm start`. Apri `/install` con la chiave che trovi nel log o in `data/install-token`.
3. **Procedura guidata**: requisiti → database (applica da sola **tutte** le migrazioni, `001` … `012`) → primo admin → template **Starter** + indirizzo pubblico del sito.
4. **Cosa trovi subito** (tutto in bozza modificabile, pubblicato alla fine dell'installazione):
   - **Pagine**: Home, Contatti (con il modulo), Privacy (testo da completare), **Blog**, e due pagine campionario, **Moduli** (`/moduli`) e **Moduli interni** (`/moduli-interni`), con tutti i blocchi disponibili.
   - **Header e Footer**: due di esempio («default» e «minimale»), da Aspetto → Header / Footer; ogni pagina sceglie il suo.
   - **Blog**: due articoli e due categorie di esempio (Articoli → Tutti gli articoli, Categorie); gli articoli stanno sotto `/blog/`.
   - **SEO e GEO**: organizzazione, fatti chiave e crawling d'esempio (Impostazioni → SEO & Geo); `robots.txt` e `sitemap.xml` si generano a ogni pubblicazione.
   - **Stile**: colori, caratteri e pulsanti in Aspetto → Stile.
5. **Primi passi consigliati**, in quest'ordine:
   1. **Dati del sito** (Impostazioni): indirizzo, lingue, marchio, testi fissi; poi **SEO & Geo** → compila *Organizzazione* (nome, contatti, indirizzo, orari, social) e i *fatti chiave*.
   2. **Aspetto → Stile**, poi **Header** e **Footer**: marchio o logo, menu, pulsante, colonne di link, link legali (con la classe CSS se serve).
   3. **Email** (Impostazioni → Email): SMTP e mittente, poi l'email di prova. Senza, le richieste dei moduli si salvano comunque in Admin → Richieste.
   4. **Pagine**: scrivi le tue; **cancella o metti in bozza** le pagine campionario (`moduli`, `moduli-interni`) e il blog di esempio se non servono: finiscono nel **Cestino**, da cui si ripristinano. Completa **Privacy** (i `[DA COMPLETARE…]` danno un avviso).
   5. **Consenso** per la mappa e **Analytics** (Dati del sito → Consenso / Analytics e script esterni).
   6. **Pubblica** dal pulsante in fondo all'editor o dalla Bacheca. Se la pubblicazione trova un problema, l'elenco è cliccabile e porta al campo da correggere.
6. **Porta online**: `SITE_PASSWORD` nel `.env` protegge tutto il sito mentre provi; `TRUST_PROXY=1` dietro un proxy; `ADMIN_HOSTS` per tenere l'admin su un indirizzo separato; poi togli `SITE_PASSWORD` e riavvia. In **Impostazioni → SEO & Geo → Crawling** il sito è «Aperto» per i motori di ricerca; mettilo su «Chiuso» finché è in prova.
7. **Cambiare password** all'utente creato per i test e **eliminare** gli utenti temporanei (`npm run admin:user` crea e reimposta).

> Provato end-to-end (ottobre 2026): database vuoto → 8 migrazioni → seed di Starter (14 documenti) → pubblicazione di 9 pagine, con blog, categorie, header e footer, sitemap e `robots.txt`.

## Dopo l'installazione

- **Email dei moduli**: Admin → Email (server SMTP, mittente, email di prova). La password SMTP si conserva cifrata con `SETTINGS_SECRET`: **non cambiare quella chiave** e includila nei backup.
- **Sito pubblicato**: `dist/` (o `SITE_OUT_DIR`). Il web server lo serve; le richieste dei moduli vanno a `/api/forms/...` sull'app.
- **Aggiornare il CMS**: sostituisci i file, `npm ci`, `npm run build:admin`, riavvia; poi `npm run db:migrate` (applica le migrazioni nuove: ad esempio la `007` per header e footer e la `008` per il blog). Un sito già installato con una versione precedente di Starter continua a funzionare: header e footer si creano alla prima apertura di Header / Footer, e il blog si attiva aggiungendo la pagina `blog` e gli articoli.
- **Backup e spostamento del sito.** Impostazioni → Backup crea un pacchetto zip con database, immagini, template attivo e (a scelta) sito pubblicato e chiave delle password email; non contiene .env né il codice. Per ripristinarlo su un altro server: installa il CMS, apri `/install`, dopo il passo «Database» scegli «Ripristina da un backup» e carica il pacchetto (oppure copialo via FTP in `data/restore/`). Dall'admin il ripristino chiede la password e la parola RIPRISTINA e fa prima un backup di sicurezza. `BACKUP_MAX_MB` (default 4096) limita la dimensione del pacchetto.
- **Articoli pianificati** (cron, una volta all'ora basta): `0 * * * * npm run publish:due`. Senza cron, se l'admin resta acceso lo fa da solo allo scoccare di ogni ora. Gli orari di pubblicazione sono a ore intere.
- **Pulizia periodica** (cron): `npm run purge` (richieste oltre `FORM_RETENTION_MONTHS`, sessioni scadute, versioni intermedie).

## Da salvare nei backup

| Cosa | Dove |
|---|---|
| Database | il database MySQL |
| Configurazione e chiavi | `.env` (o il file indicato da `ENV_FILE`) |
| Immagini caricate | `media/` (o `MEDIA_DIR`) |
| Template installati e attivo | `templates/`, `data/active-template.json` |
| Copie di sicurezza dei contenuti | `data/backups/` |

## Variabili d'ambiente utili

`APP_ORIGIN`, `TRUST_PROXY`, `SITE_OUT_DIR`, `MEDIA_DIR`, `MEDIA_QUOTA_MB`, `DATA_DIR` (default `data/`), `TEMPLATES_DIR` (default `templates/`), `ENV_FILE`, `INSTALL_TOKEN`, `FORM_RETENTION_MONTHS`, `SMTP_*` (ripiego: di norma si usa Admin → Email), `SITE_PASSWORD`/`SITE_PASSWORD_USER` (protezione temporanea di tutto il sito, solo per i test — vedi sotto). Vedi `.env.example`.

Per la sicurezza dei template: `ADMIN_HOSTS` (gli unici indirizzi da cui `/admin` e `/install` esistono), `ALLOW_TEMPLATE_UPLOAD=0` (spegne il caricamento di zip), `CMS_RENDER_WRAPPER` (comando che avvolge il processo isolato, per esempio `["unshare","-Urn"]`).

## Hosting condiviso (per esempio Infomaniak Node.js)

Provato su Infomaniak Node.js Hosting (ottobre 2026): funziona, ma con alcune particolarità di quel tipo di hosting che vale la pena conoscere prima, non scoprirle una per una durante il deploy.

- **Porta**: il pannello assegna una porta a sua scelta tramite la variabile `PORT`. `npm start` la rispetta (`next start -p ${PORT:-3000}`, con ripiego a 3000 in locale).
- **`TRUST_PROXY=1`**: dietro il proxy del fornitore l'indirizzo del visitatore viene dall'ultimo valore di `X-Forwarded-For`.
- **Deploy via git**: se cloni il repository direttamente sul server, il `.gitignore` del motore esclude `media/` e `data/` **solo alla radice** (non in giro per l'albero): non deve succedere che una cartella come `app/admin/media/` finisca ignorata per errore. Se il tuo fork ha un `.gitignore` con `media/`/`data/` senza `/` iniziale, correggilo prima: altrimenti la build fallisce con `Module not found` su percorsi che sembrano innocui.
- **Build e avvio possono girare su filesystem/contenitori separati**: su alcuni pannelli, quello che il passo "Build" installa/compila non è detto che sia ancora lì quando parte "Run" (sintomo tipico: `next: not found` o `Could not find a production build in the '.next' directory` appena dopo una build andata a buon fine). Se càpita, o rendi il comando di avvio autosufficiente (`npm install && npm run build:admin && npm run db:migrate && next start -p ${PORT:-3000}` come comando di "Run", accettando partenze più lente), oppure compila **altrove** (il tuo computer, un'immagine CI con lo stesso Node) e pubblichi direttamente la cartella `.next` già pronta (via git o upload): in tal caso l'avvio diventa solo `npm install --omit=dev && npm run db:migrate && next start -p ${PORT:-3000}`, molto più leggero — utile anche se il piano non ha RAM sufficiente per `next build` (altro sintomo osservato: la build si blocca silenziosamente, o la connessione SSH cade, proprio durante "Collecting page data" — segno di memoria esaurita, non di un comando bloccato).
  - Se compili altrove e pubblichi solo `.next`, **non serve** portarsi dietro `.next/cache` né `.next/trace` (solo cache di compilazione, non servono per l'esecuzione): toglierli riduce di molto la dimensione da trasferire.
- **Storage di rete lento**: su hosting containerizzato `/srv` (o equivalente) può essere un filesystem di rete (es. CephFS), non disco locale. Sintomi: `rm -rf` che fallisce con `Directory not empty` su cartelle che dovrebbero essere vuote (di solito un processo precedente le tiene ancora aperte: controlla `ps aux` prima di insistere), oppure un `git pull`/`clone` che sembra fermo per diversi minuti scrivendo centinaia di file piccoli (`.next/static/chunks/...`): di solito è solo lento, non bloccato — verifica con `ps aux | grep git` se il processo sta ancora lavorando prima di interromperlo.
- **Database gestito**: `Access denied for user '...'@'<host del gateway in uscita>'` con password corretta è spesso un vincolo di **host autorizzati** lato database (alcuni pannelli richiedono di abilitare esplicitamente da quale host ci si può connettere), non una password sbagliata. Isola il problema provando la connessione diretta (`mysql -h ... -u ... -p`) prima di sospettare l'app.
- **Instradamento del sito pubblico**: se il pannello non offre un modo per instradare `/admin`/`/api` all'app Node e il resto ai file statici (vedi «Sito pubblico: servito da un proxy esterno o dall'app stessa» in `docs/architettura.md`), non serve configurare nulla: `app/[[...slug]]/route.js` serve il sito pubblico direttamente dall'app.
- **Proteggere il sito durante i test**: `SITE_PASSWORD` (e opzionale `SITE_PASSWORD_USER`, default `preview`) nel `.env` attiva l'autenticazione HTTP Basic del browser su **tutto** il sito (pubblico, admin, api). Utile per un ambiente di test raggiungibile da internet ma non ancora da mostrare. Rimuovila (e riavvia) prima di andare online.

## Sicurezza dell'installazione

- `/install` è protetta dalla chiave (inviata in un'intestazione, mai nell'indirizzo) e limita i tentativi; dopo l'installazione risponde con un reindirizzamento all'accesso, le sue azioni rifiutano ogni richiesta e il file della chiave viene cancellato.
- Non lasciare l'app raggiungibile da internet **prima** di aver installato: chi conosce l'indirizzo e la chiave potrebbe installare al tuo posto (la chiave è leggibile solo da chi ha accesso al server).
- **Consigliato in produzione**: admin su un indirizzo separato dal sito pubblico con `ADMIN_HOSTS=admin.cliente.ch`; `ALLOW_TEMPLATE_UPLOAD=0` se i template li installi tu; su un server Linux dove puoi, `CMS_RENDER_WRAPPER` con `unshare` o `bwrap`.
- I template sono codice e il loro isolamento ha **limiti** (rete e segnali non sono limitati da Node, il JavaScript del template gira nel sito pubblico): leggi «Template e sicurezza» in `docs/architettura.md` prima di installare template di terzi.
