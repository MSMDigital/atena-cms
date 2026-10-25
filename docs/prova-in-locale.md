# Provare Atena CMS in locale

Due modi: **A** usa l'istanza di sviluppo già installata; **B** prova l'installazione guidata da zero su una copia separata, senza toccare la A.

Ogni comando parte dalla cartella del progetto e, in un terminale nuovo, dopo:

```sh
. ~/.nvm/nvm.sh && nvm use 22
```

(serve Node 22.12 o più recente; quello predefinito del Mac è più vecchio).

## Prima di tutto: il database

Il database MySQL gira in Docker (porta **3307**). Docker Desktop deve essere acceso.

```sh
npm run db:up        # avvia MySQL e aspetta che sia pronto
npm run db:down      # lo spegne (i dati restano nel volume)
```

## A. Usare l'istanza di sviluppo

```sh
npm run dev          # admin su http://localhost:3000/admin
```

Accedi con `webdeveloper@msmdigital.it` e la password che hai scelto. Se non la ricordi:

```sh
node scripts/create-user.mjs --email webdeveloper@msmdigital.it --name Atena --role admin --reset
```

(scrive una nuova password sul terminale, **una sola volta**; la riga da leggere è «Password (mostrata una sola volta…)»).

### Vedere il sito pubblico

In un secondo terminale:

```sh
npm run build        # genera il sito statico in dist/
npm run serve        # lo serve su http://localhost:4173
```

Il server locale inoltra i moduli all'app sulla porta 3000, quindi l'invio dei moduli funziona. Dopo ogni modifica ai contenuti usa **Pubblica** nell'admin: rigenera il sito da solo.

### Cosa provare

| Dove | Cosa |
|---|---|
| Pagine | modificare testi e blocchi, l'anteprima cambia subito; riordinare, duplicare, nascondere, aggiungere blocchi |
| Stile | colori, dimensioni dei titoli, effetto pulsanti, con anteprima dal vivo |
| Immagini | caricare (vengono ricodificate in WebP), scegliere il punto focale |
| Dati del sito | contatti, menu, consenso alla mappa (integrato o iubenda) |
| Email | server SMTP e email di prova; senza SMTP le richieste si salvano lo stesso |
| Richieste | compilare un modulo dal sito pubblico e vederlo nell'elenco |
| Template | attivare **Starter** (ha blocchi propri); i contenuti si sostituiscono con quelli di esempio, con copia di sicurezza in `data/backups/` |
| Utenti | non c'è una pagina di gestione: si creano da riga di comando (`node scripts/create-user.mjs --email … --name … --role editor`); l'*editor* vede solo pagine e blocchi condivisi |

### Attenzione a `.next`

`npm run dev` e `npm start` usano la stessa cartella `.next`. Se passi dall'uno all'altro (o avvii una seconda copia in sviluppo) l'admin si rompe: fermalo e rifai

```sh
npm run build:admin
```

### Errori in console

- «unsafe-eval» in sviluppo: risolto. Con `npm run dev` la politica di sicurezza ammette `eval` solo in quella modalità (serve al refresh automatico di React); in produzione no.
- «Access to fetch … from origin 'null' … _devMiddlewareManifest.json»: era una pagina dell'admin finita dentro l'iframe dell'anteprima (che ha origine `null` perché isolato). Ora l'anteprima riceve sempre HTML dall'editor e, senza sessione, `/admin/preview` risponde 401 invece di mandare al login. Se lo rivedi: ricarica la pagina (la sessione potrebbe essere scaduta) e segnala in quale pagina e con quale browser.
- «Failed to load resource … 404» per `favicon.ico`: innocuo, non c'è un'icona del sito per l'admin.

## B. Provare l'installazione guidata da zero

### Il modo automatico

```sh
node scripts/e2e-install.mjs
```

Usa database e cartelle temporanei, esegue tutti i passi (chiave, requisiti, database, primo admin, zip del template, template dall'admin, cambio di template, rimozione) e alla fine pulisce. Non tocca la tua istanza. Serve l'admin già compilato (`npm run build:admin`) e Docker acceso.

### A mano, per vedere il wizard

1. **Ferma** l'istanza A (Ctrl+C): due copie in sviluppo nella stessa cartella non convivono.
2. **Database vuoto** per la prova (la password di root la legge il container, non va scritta):

   ```sh
   docker exec atena-cms-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "CREATE DATABASE atena_cms_prova CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; GRANT ALL ON atena_cms_prova.* TO \"cms\"@\"%\";"'
   ```

3. **Zip del template** (finisce nella cartella del progetto, es. `starter-1.2.0.zip`):

   ```sh
   npm run template:pack -- templates/starter
   ```

4. **Avvia una copia isolata**: cartelle a parte, e le variabili del `.env` di sviluppo svuotate, altrimenti la procedura vedrebbe il database già installato e si considererebbe già installata.

   ```sh
   P=/tmp/cms-prova
   env DB_HOST= DB_PORT= DB_NAME= DB_USER= DB_PASSWORD= DB_ROOT_PASSWORD= SETTINGS_SECRET= IP_HASH_SECRET= \
       APP_ORIGIN= TRUST_PROXY= INSTALL_TOKEN= CMS_TEMPLATE= CMS_TEMPLATE_DIR= SMTP_HOST= MAIL_FROM= \
       DATA_DIR=$P/data TEMPLATES_DIR=$P/templates ENV_FILE=$P/.env SITE_OUT_DIR=$P/dist MEDIA_DIR=$P/media \
       npx next dev -p 3100
   ```

5. Apri http://localhost:3100/install e segui i passi:
   - **Chiave**: nel terminale («Chiave di installazione…») e in `/tmp/cms-prova/data/install-token`.
   - **Requisiti**: devono essere tutti a posto.
   - **Database**: host `127.0.0.1`, porta `3307`, nome `atena_cms_prova`, utente `cms` e la password `DB_PASSWORD` del tuo `.env`. La password del database non può contenere `$ ' " \ ` #`.
   - **Primo admin**: nome, email, password di almeno 12 caratteri.
   - **Template**: carica lo zip del punto 3, indica l'indirizzo pubblico del sito.
6. Finito: `/install` si chiude, accedi da http://localhost:3100/admin.

### Pulizia

```sh
docker exec atena-cms-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "DROP DATABASE atena_cms_prova"'
rm -rf /tmp/cms-prova starter-1.2.0.zip
npm run build:admin      # la copia in sviluppo ha sovrascritto .next
```

## Le prove automatiche

| Comando | Cosa verifica | Serve |
|---|---|---|
| `npm test` | 184 test (token, sessioni, contenuti, template, installazione, sicurezza…) | Docker (database di prova temporaneo) |
| `node scripts/e2e-install.mjs` | installazione da zero e gestione dei template | admin compilato, Docker |
| `node scripts/e2e-editor.mjs`, `e2e-admin.mjs`, `e2e-media.mjs`, `e2e-forms.mjs` | l'admin con un browser vero | admin avviato con `npm start`, un utente admin temporaneo, `E2E_URL`, `E2E_EMAIL`, `E2E_PASSWORD` |
| `node scripts/e2e-consent.mjs` | consenso alla mappa sul sito statico | niente |
| `npm run probe:security` | attacchi all'app in esecuzione (55 controlli) | come sopra |

Le prove nel browser **salvano e pubblicano davvero** e poi ripristinano i contenuti: usale solo sul database di sviluppo. Per l'utente temporaneo:

```sh
node scripts/create-user.mjs --email e2e@esempio.test --name E2E --role admin --reset
# ... prove ...  poi elimina l'utente dal database:
docker exec atena-cms-db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" atena_cms -e "DELETE FROM users WHERE email=\"e2e@esempio.test\""'
```

Le credenziali non vanno mai scritte nei comandi o nei file del progetto: stanno nel `.env` (ignorato da git) o nelle variabili d'ambiente.

## Cosa non è stato provato

- L'installazione su un server vero (Infomaniak).
- L'invio email con un SMTP reale.
- iubenda con un account vero (finora uno script finto).
