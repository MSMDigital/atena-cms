# Atena CMS: documentazione tecnica

Per chi installa, ospita e mantiene il CMS (sistemista, sviluppatore). Chi deve solo gestire i contenuti trova la guida in [guida-utente.md](guida-utente.md). Il contratto tra motore e template è in [architettura.md](architettura.md); i dettagli di installazione su hosting particolari sono in [../INSTALL.md](../INSTALL.md).

## 1. Panoramica

Atena CMS è diviso in due parti che si installano e si aggiornano separatamente:

| Parte | Cosa contiene | Dove |
|---|---|---|
| **Motore (installer)** | admin, database, login e ruoli, libreria immagini, moduli e richieste, email, pubblicazione, procedura di installazione | `app/`, `lib/`, `schema/`, `render/`, `migrations/`, `scripts/`, `middleware.js` |
| **Template** | design, CSS/JS, blocchi, HTML delle pagine, contenuti di esempio | `templates/<id>/` (installati), `template-library/<id>/` (sorgenti fuori dall'installer) |

Un'installazione = un sito = un database.

**Come lavora.** L'admin è un'app Next.js 15 (App Router, React 19) che scrive su MySQL. Il **sito pubblico è HTML statico**: a ogni pubblicazione il motore genera i file in `dist/` (una cartella per pagina e lingua, `sitemap.xml`, `robots.txt`, `404.html`, asset). Il codice HTML dei template gira in un **processo Node isolato** (modello di permessi di Node), mai nel processo principale. Il sito pubblico può essere servito da un web server davanti (consigliato) oppure dall'app stessa.

```
Visitatore ──► web server / proxy ──► dist/        (sito statico)
                    │
                    └─ /admin  /install  /api/ ──► app Node (Next.js, porta 3000) ──► MySQL
                                                      │
                                                      ├─ media/   immagini caricate
                                                      ├─ data/    stato dell'installazione
                                                      └─ processo isolato ──► templates/<id>/render
```

## 2. Requisiti del server

| Componente | Requisito |
|---|---|
| Sistema operativo | Linux (consigliato), macOS o Windows con WSL; qualunque sistema dove giri Node 22 |
| **Node.js** | **22.12 o più recente** (`.nvmrc` = 22). Serve il modello di permessi (`--permission`) che isola i template; la procedura di installazione controlla la versione e si blocca se è più vecchia. Il campo `engines` di `package.json` è `>=22.12`. Versione in uso sul sistema di sviluppo: 22.23.2 |
| npm | quello incluso in Node 22 (si usa `npm ci`) |
| **Database** | **MySQL 8.x** (sviluppo: `mysql:8.4`) oppure **MariaDB 10.6+**; set di caratteri `utf8mb4`, collation `utf8mb4_unicode_ci`; un database **vuoto** e un utente con permesso di creare tabelle |
| Immagini | `sharp` 0.35 (binari precompilati, installati da `npm ci`); la procedura di installazione ne verifica il caricamento |
| Memoria | almeno 1 GB liberi per `next build`; l'app in esercizio sta in poche centinaia di MB (il processo isolato dei template ha un tetto di 512 MB). Su hosting con poca RAM compila altrove (vedi INSTALL.md) |
| Disco | codice e `node_modules` ≈ 500 MB, più `media/` (quota immagini di default 1 GB, `MEDIA_QUOTA_MB`), `dist/` e i backup (`BACKUP_MAX_MB`, default 4 GB) |
| Rete | porta dell'app (default 3000, o la `PORT` del pannello di hosting); uscita verso il server SMTP per le email dei moduli |
| Permessi di scrittura | cartella del progetto (per `.env`), `data/`, `templates/`, `media/`, `dist/` (o `SITE_OUT_DIR`) |
| Web server / proxy | per la produzione: instradare `/admin`, `/install`, `/api/` all'app e il resto a `dist/`. Facoltativo: senza proxy l'app serve anche il sito pubblico (`app/[[...slug]]/route.js`) |
| HTTPS | obbligatorio in produzione: i cookie di sessione e l'intestazione HSTS dipendono da `APP_ORIGIN` che inizia per `https://` |

Dipendenze principali (`package.json`): `next` 15.5, `react`/`react-dom` 19, `mysql2`, `nodemailer`, `sharp`, `ajv` + `ajv-formats` (validazione degli schemi), `fflate` (zip di template e backup). Solo per sviluppo: `puppeteer-core` (prove nel browser) e `smtp-server` (prove delle email).

## 3. Struttura del progetto

```
app/                  admin (Next.js App Router), /install, /api/forms, /api/private-access, route jolly del sito pubblico
  admin/(shell)/      sezioni dell'admin: pagine, articoli, media, utenti, richieste, stile, email, backup, template…
  install/            procedura guidata di installazione
lib/                  logica del motore: db, auth, sessioni, permessi, documenti, media, moduli, email, backup, template…
schema/               schemi JSON dei dati (pagina, sito, blog, SEO…) e validazione
render/               generazione dell'HTML: contesto, kit per i template, SEO, processo isolato (host.mjs / child.mjs)
migrations/           001_init.sql … 013_api_tokens.sql
scripts/              riga di comando (migrazioni, utenti, build, pubblicazione pianificata, pulizia, pacchetti template)
public/               file serviti dall'admin (script dell'anteprima, marchio)
templates/            template installati. Nell'installer: solo starter/
template-library/     template tenuti FUORI dall'installer (oggi: daria-benedetto/)
data/                 stato dell'installazione (fuori da git): template attivo, chiave di installazione, backup, percorso dell'admin
media/                immagini caricate dall'admin (fuori da git)
dist/                 sito pubblicato (fuori da git)
tests/                prove automatiche (node:test)
docs/                 questa documentazione
```

## 4. Database

Connessione: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` (nel `.env`). Il driver è `mysql2` con pool di connessioni. Le migrazioni sono file SQL numerati in `migrations/`, applicati in ordine da `npm run db:migrate` (e dall'installazione guidata); lo stato è registrato nel database, quindi si possono rilanciare senza effetti.

### Tabelle

| Tabella | Contenuto |
|---|---|
| `users`, `sessions`, `login_attempts` | utenti (ruoli `admin`, `author`, `normal`), sessioni (nel DB solo lo SHA-256 del token), tentativi di accesso falliti |
| `docs`, `doc_revisions` | tutti i contenuti: pagine, articoli, categorie, tag, header, footer, dati del sito, stile, blocchi condivisi. Ogni documento ha **bozza** e **versione pubblicata**, revisione numerata per i salvataggi concorrenti, cestino (`deleted_at`) e cronologia |
| `publications` | registro delle pubblicazioni (riuscite e fallite) |
| `media` | libreria immagini: file, dimensioni, testi alternativi per lingua, chi ha caricato |
| `form_submissions` | richieste ricevute dai moduli del sito, con stato (nuova, letta, archiviata) e esito dell'invio email |
| `settings` | impostazioni dell'admin (SMTP, generali…); i segreti sono cifrati con `SETTINGS_SECRET` |
| `audit_log` | registro delle operazioni sensibili (per esempio installazione di template) |

### Migrazioni

| File | Introduce |
|---|---|
| `001_init` | utenti, sessioni, tentativi di accesso, documenti, revisioni, pubblicazioni, media, richieste dei moduli |
| `002_rev_and_deletion` | revisioni per i salvataggi concorrenti, eliminazione/cestino |
| `003_media` | libreria immagini |
| `004_form_mail` | esito dell'invio email delle richieste |
| `005_settings` | impostazioni cifrate |
| `006_audit` | registro delle operazioni |
| `007_layouts` | header e footer multipli |
| `008_blog` | articoli e categorie |
| `009_tags` | tag degli articoli |
| `010_media_meta` | metadati delle immagini |
| `011_users` | profilo utenti, ruoli |
| `012_media_i18n` | testi alternativi delle immagini per lingua |
| `013_api_tokens` | token dell'API degli articoli |

Dopo un aggiornamento del CMS eseguire sempre `npm run db:migrate`.

### Database di sviluppo

`docker-compose.yml` avvia `mysql:8.4` (container `atena-cms-db`, porta `127.0.0.1:3307`, volume `outsmart_cms_db`: il nome è storico, non rinominarlo o si scollega il database esistente). Comandi: `npm run env:init` (crea `.env` con password casuali), `npm run db:up`, `npm run db:down`.

## 5. Installazione

Procedura completa e variante per hosting condiviso: [INSTALL.md](../INSTALL.md). In sintesi:

```sh
npm ci
npm run build:admin     # compila l'admin (next build)
npm start               # next start -p ${PORT:-3000}
```

Poi si apre `https://<indirizzo>/install` con la chiave di installazione (riga «Chiave di installazione» nel log, oppure `data/install-token`, oppure la variabile `INSTALL_TOKEN` di almeno 16 caratteri). La procedura: controlla i requisiti, crea le tabelle e scrive `.env` (permessi 600) con `SETTINGS_SECRET` e `IP_HASH_SECRET`, crea il primo admin (password di almeno 12 caratteri), installa il template e pubblica il sito. Al termine `/install` si chiude per sempre e il file della chiave viene cancellato.

Per un'esecuzione stabile in produzione usare un gestore di processi (systemd, pm2, il pannello dell'hosting) che avvii `npm start` e lo riavvii in caso di errore.

## 6. Configurazione (`.env`)

Il file `.env` sta nella cartella del progetto (o dove indica `ENV_FILE`), non va mai in git e deve avere permessi 600. Il modello è `.env.example`. La password del database non può contenere `$ ' " \ ` #`.

| Variabile | Significato | Default |
|---|---|---|
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | connessione al database | 127.0.0.1, 3307, `atena_cms`, `cms` |
| `DB_ROOT_PASSWORD` | solo per il database Docker di sviluppo | — |
| `APP_ORIGIN` | indirizzo con cui si apre l'admin (controllo dell'origine; con `https://` attiva HSTS e cookie sicuri) | `http://localhost:3000` |
| `TRUST_PROXY` | `1` se l'app sta dietro un proxy fidato che aggiunge l'IP del client in coda a `X-Forwarded-For`. In produzione dietro proxy va messo a 1 | `0` |
| `SETTINGS_SECRET` | chiave che cifra le password salvate (SMTP). **Non cambiarla** e salvala nei backup | generata |
| `IP_HASH_SECRET` | sale per rendere anonimo l'IP nei limiti di richieste | generata |
| `SITE_OUT_DIR` | dove si scrive il sito pubblicato | `dist/` |
| `MEDIA_DIR`, `MAX_UPLOAD_MB`, `MEDIA_QUOTA_MB` | cartella immagini, peso massimo per file, quota totale | `media/`, 10, 1024 |
| `DATA_DIR`, `TEMPLATES_DIR`, `ENV_FILE` | percorsi dello stato, dei template e del file di configurazione | `data/`, `templates/`, `.env` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | ripiego per l'email; di norma si configura da Admin → Email (ha la precedenza), dove si sceglie tra server SMTP e API di Brevo | — |
| `FORM_ALLOWED_ORIGINS` | solo se il sito statico sta a un indirizzo diverso dall'app | — |
| `FORM_RETENTION_MONTHS` | mesi di conservazione delle richieste per `npm run purge` | non elimina |
| `BACKUP_MAX_MB` | dimensione massima dei pacchetti di backup | 4096 |
| `INSTALL_TOKEN` | chiave scelta da te per `/install` | generata |
| `ADMIN_HOSTS` | indirizzi da cui esistono `/admin` e `/install` (gli altri: 404). Consigliato: admin su un dominio separato | — |
| `ALLOW_TEMPLATE_UPLOAD` | `0` spegne il caricamento di template da zip | attivo |
| `CMS_RENDER_WRAPPER` | comando che avvolge il processo isolato, lista JSON (es. `["unshare","-Urn"]`) | — |
| `CMS_TEMPLATE`, `CMS_TEMPLATE_DIR`, `CMS_RENDER=inline` | solo per script e sviluppo di template (`inline` disattiva l'isolamento) | — |
| `SITE_PASSWORD`, `SITE_PASSWORD_USER` | protezione HTTP Basic di **tutto** il sito durante i test; da togliere prima di andare online | utente `preview` |
| `API_POSTS_PER_HOUR` | massimo di articoli che l'API può creare in un'ora per utente | 20 |
| `PORT` | porta dell'app (la imposta il pannello di hosting) | 3000 |

## 7. Sicurezza

- **Accesso**: password con hash `scrypt`; sessioni di 7 giorni con cookie `cms_session` (httpOnly, nel DB solo l'hash del token); limiti di tentativi in 15 minuti (5 per account e indirizzo, 20 per account, 20 per indirizzo); verifiche delle password a coda limitata per evitare saturazione della CPU.
- **Indirizzo di accesso personalizzato** (Admin → Login sicuro): sostituisce `/admin/login` con un indirizzo scelto; quello standard risponde «non trovato». È salvato in `data/admin-path.json` e letto dal middleware.
- **Admin su dominio separato**: `ADMIN_HOSTS=admin.cliente.ch`; sul dominio del sito `/admin` e `/install` non esistono. Raccomandato perché il JavaScript dei template gira nel sito pubblico.
- **Intestazioni**: `middleware.js` imposta una Content-Security-Policy con nonce per richiesta; `next.config.mjs` aggiunge `X-Content-Type-Options`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, HSTS (solo con `https`), `Cache-Control: no-store` su admin, install e api.
- **Template**: sono codice. Pacchetto zip non fidato (percorsi, tipi, dimensioni, rapporto di compressione); prova di esecuzione prima dell'installazione; esecuzione in processo isolato con il modello di permessi di Node (nessuna scrittura, letture limitate, ambiente vuoto, tempo e memoria limitati); installazione consentita solo a un admin con conferma della password e registrata in `audit_log`. **Limiti noti**: Node non limita rete e segnali; per un isolamento vero usare `CMS_RENDER_WRAPPER`. Dettagli in [architettura.md](architettura.md#template-e-sicurezza).
- **Moduli del sito**: validazione server, controllo dell'origine, anti-bot, limiti (5 richieste all'ora per IP dietro proxy fidato, 60 all'ora per modulo, duplicati identici ignorati per 10 minuti).
- **Immagini**: tipi ammessi JPG, PNG, WebP, SVG (riconosciuti dal contenuto, non dall'estensione); massimo 50 megapixel; lato lungo ridotto a 2400 px; ruotate secondo EXIF.
- **Testi ricchi**: sempre sanificati. Le uniche eccezioni (blocco «Codice HTML», script di tracciamento) sono riservate agli admin.
- **Segreti**: mai nel database in chiaro (`SETTINGS_SECRET`), mai nei template (ambiente vuoto nel processo isolato).
- **Prima dell'installazione** non lasciare l'app raggiungibile da internet senza protezione: chi conosce l'indirizzo e la chiave potrebbe installare al posto tuo (usare `SITE_PASSWORD`).

## 8. Template: installer e libreria separati

L'installer contiene **un solo template, `templates/starter`**, quello con cui parte ogni sito nuovo. I template dei clienti stanno fuori da `templates/`, così non entrano nell'installer:

- `template-library/daria-benedetto/` — sito Daria Benedetto (coach). Non viene installato da solo.

Come usare un template della libreria su un sito:

```sh
# 1. creare il pacchetto zip (controllo completo + prova di esecuzione)
npm run template:pack -- template-library/daria-benedetto daria-benedetto-1.0.0.zip

# 2. caricarlo da Admin → Aspetto → Template (oppure al passo «Template» dell'installazione)
```

In alternativa copiare la cartella in `templates/` (utile con `ALLOW_TEMPLATE_UPLOAD=0`), oppure puntare `TEMPLATES_DIR` a una cartella con i template. Un nuovo template si crea partendo da `templates/starter`: la guida è in `templates/starter/docs/template.md`.

Un pacchetto contiene `template.json`, `tokens.json`, `schema/`, `ui.json`, `render/index.mjs`, `assets/`, `content/`. Il motore accetta template con `"engine": 1`. Il pacchetto di supporto `@cms/kit` (strumenti del motore per i template) si genera da solo accanto ai template, in `node_modules/@cms/kit` (già escluso da git).

Per cambiare template su un sito esistente: Admin → Aspetto → Template (si può scegliere se tenere i contenuti attuali o sostituirli con quelli di esempio; viene fatta una copia di sicurezza in `data/backups/`).

## 9. Pubblicazione e sito pubblico

- **Pubblicare** (Admin → Pubblica): il motore valida tutti i contenuti, fa il render di ogni pagina e lingua nel processo isolato e scrive `dist/` in modo atomico. Con contenuti non validi non cambia nulla e la pubblicazione viene registrata come fallita.
- **Pubblicazione pianificata** (articoli con data futura): `0 * * * * npm run publish:due` (cron, ogni ora). Senza cron l'admin acceso lo fa da solo a ogni ora piena.
- **Servire il sito**: con proxy davanti, `dist/` come radice statica e `/admin`, `/install`, `/api/` verso l'app. Senza proxy basta l'app: la route jolly serve `dist/` con le stesse regole di `npm run serve`. In locale `npm run serve` serve `dist/` su `http://localhost:4173`.
- **404**: generata come `404.html` (modificabile da Impostazioni → 404).
- **SEO e GEO**: `robots.txt`, `sitemap.xml`, dati strutturati JSON-LD, hreflang e `llms.txt` (scritto a mano) si producono a ogni pubblicazione.

## 10. Operazioni e manutenzione

| Attività | Come |
|---|---|
| Creare/reimpostare un utente da terminale | `npm run admin:user` |
| Cambiare l'indirizzo di accesso da terminale | `npm run admin:path` |
| Migrazioni | `npm run db:migrate` (dopo ogni aggiornamento) |
| Pulizia periodica (richieste oltre `FORM_RETENTION_MONTHS`, sessioni scadute, versioni intermedie) | `npm run purge` (cron settimanale) |
| Validare i contenuti di un template | `npm run validate` |
| Build/serve del sito da riga di comando | `npm run build`, `npm run serve` |
| Controllo di sicurezza | `npm run probe:security` |
| Prove automatiche | `npm test` (richiede il database attivo e Node 22) |

### Backup

Da Admin → Impostazioni → Backup si crea un pacchetto zip con database, immagini, template attivo e, a scelta, sito pubblicato e chiave delle password email. **Non** contiene `.env` né il codice. In più, da salvare a parte:

| Cosa | Dove |
|---|---|
| Database | il database MySQL (anche con `mysqldump`) |
| Configurazione e chiavi | `.env` — in particolare `SETTINGS_SECRET` |
| Immagini caricate | `media/` (o `MEDIA_DIR`) |
| Template installati e attivo | `templates/`, `data/active-template.json` |
| Copie di sicurezza dei contenuti | `data/backups/` |
| Template dei clienti | `template-library/` |

Ripristino su un altro server: installare il CMS, aprire `/install`, dopo il passo «Database» scegliere «Ripristina da un backup» e caricare il pacchetto (oppure copiarlo in `data/restore/`). Dall'admin il ripristino chiede password e la parola RIPRISTINA e fa prima un backup di sicurezza.

### Aggiornare il CMS

1. Backup (admin + database).
2. Sostituire i file del motore (senza toccare `.env`, `data/`, `media/`, `templates/` installati).
3. `npm ci && npm run build:admin && npm run db:migrate`.
4. Riavviare l'app.

### Diagnosi

| Sintomo | Causa probabile |
|---|---|
| Installazione bloccata sul requisito Node | Node precedente a 22.12; `node -v` e aggiornare (con nvm: `nvm use 22`) |
| «Nessun template attivo» | l'installazione non è completa o `data/active-template.json` manca |
| `next: not found` / «Could not find a production build» dopo la build | build e avvio girano su contenitori separati (vedi INSTALL.md, hosting condiviso) |
| Build che si blocca in «Collecting page data» | memoria insufficiente: compilare su un'altra macchina |
| `Access denied for user` con password corretta | l'host dell'app non è autorizzato lato database |
| Le richieste dei moduli arrivano ma non le email | controllare Admin → Email (server, mittente, email di prova); l'esito è nella scheda di ogni richiesta |
| Gli IP dei visitatori risultano sconosciuti | manca `TRUST_PROXY=1` dietro il proxy |
| Password SMTP «illeggibile» dopo un ripristino | `SETTINGS_SECRET` diversa da quella originale |
| Un template non si installa | leggere l'elenco di errori della prova di esecuzione; se importa moduli non ammessi usare solo `@cms/kit` |

## 11. Prove automatiche

`npm test` esegue le prove con `node:test` (`tests/*.test.mjs`, in sequenza) usando il template `templates/starter` come contenuto di prova e il database configurato in `.env`: usare un database di sviluppo, non quello di un sito vero. Le prove nel browser (`scripts/e2e-*.mjs`) richiedono Chrome e `puppeteer-core`.

## 12. API per inviare articoli (bozze)

`POST /api/posts` crea un articolo **in bozza**; non pubblica mai (un admin lo controlla e lo pubblica da Articoli). È pensata per un programma esterno, per esempio Claude.

```sh
curl -X POST https://admin.cliente.ch/api/posts \
  -H "Authorization: Bearer atn_…" -H "Content-Type: application/json" \
  -d '{"title":"Titolo","text":"Testo in **markdown** semplice.","image":{"data":"<base64>","filename":"foto.jpg","alt":"Descrizione"}}'
# 201 {"ok":true,"key":"titolo","status":"draft"}
```

- **Dati**: `title` (3–200 caratteri) e `text` (fino a 100.000) obbligatori; `image` facoltativa (JPG, PNG o WebP in base64, peso massimo `MAX_UPLOAD_MB`; l'SVG è rifiutato). Il testo è markdown semplice (paragrafi, `#` titoli, elenchi, citazioni, grassetto, corsivo, link http/https/mailto); l'HTML grezzo non esiste (tutto è escapato) e il risultato passa dalla sanificazione dei testi ricchi. Il template deve avere il blocco `text`. Non si scarica nessuna immagine da un indirizzo (niente SSRF): l'immagine arriva nel corpo.
- **Token** (Admin → Impostazioni → API, solo admin): casuale a 256 bit (`atn_` + 43 caratteri), visibile **una volta** alla creazione; nel database c'è solo lo SHA-256 (`api_tokens`). Appartiene a un utente attivo admin o autore, che risulta autore e proprietario degli articoli; scadenza facoltativa (1–730 giorni); revocabile. Se l'utente è disattivato o eliminato il token smette di funzionare. Creazione e revoca vanno in `audit_log`.
- **Difese**: solo `Authorization: Bearer` (nessun cookie, quindi nessun CSRF) e nessun CORS; una sola risposta 401 per token mancante, errato, scaduto o revocato; 10 tentativi sbagliati ogni 15 minuti per indirizzo (poi 429); `API_POSTS_PER_HOUR` articoli all'ora per utente; `Content-Type: application/json` e `Content-Length` obbligatori, corpo limitato; con `ADMIN_HOSTS` l'API esiste solo su quegli indirizzi (404 altrove); l'immagine passa dalla stessa elaborazione dei caricamenti (ricodifica in WebP, niente metadati). La route è fuori dal middleware (come gli upload): con `SITE_PASSWORD` attiva l'API non chiede la password del sito, solo il token.
- **Rete**: usare sempre HTTPS (il token viaggia nell'intestazione). Dietro un proxy impostare `TRUST_PROXY=1`, altrimenti il blocco per indirizzo vale per tutti insieme. Il proxy deve lasciar passare corpi fino a circa 14 MB (`client_max_body_size 15m;` in Nginx).
