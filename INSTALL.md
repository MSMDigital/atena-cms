# Installare Outsmart CMS

Il CMS è il **motore** (admin, database, login, immagini, moduli, pubblicazione). Il **sito** (design, blocchi, HTML, contenuti di esempio) è un **template**, che si installa a parte. Un'installazione = un sito = un database.

## Requisiti

- Node.js **22.12** o più recente (i template girano in un processo isolato che usa il modello di permessi di Node).
- MySQL 8 o MariaDB 10.6+ con un database **vuoto** e un utente che possa creare tabelle.
- Un utente del sistema che possa scrivere in: la cartella del progetto (per `.env`), `data/`, `templates/`, `media/` e nella cartella del sito pubblicato (`dist/`).
- Dietro un web server o un proxy: `/admin`, `/install` e `/api/` vanno all'app Node; tutto il resto è il sito statico (`dist/`).

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
5. **Template**: scegli uno di quelli già presenti in `templates/` oppure carica un file `.zip`. Indica l'indirizzo pubblico del sito. Si installano i contenuti di esempio e il sito viene pubblicato subito.

Finito, `/install` si chiude per sempre e la chiave non serve più. Si accede da `/admin`.

## Dopo l'installazione

- **Email dei moduli**: Admin → Email (server SMTP, mittente, email di prova). La password SMTP si conserva cifrata con `SETTINGS_SECRET`: **non cambiare quella chiave** e includila nei backup.
- **Sito pubblicato**: `dist/` (o `SITE_OUT_DIR`). Il web server lo serve; le richieste dei moduli vanno a `/api/forms/...` sull'app.
- **Aggiornare il CMS**: sostituisci i file, `npm ci`, `npm run build:admin`, riavvia; poi `npm run db:migrate` (applica le migrazioni nuove).
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

`APP_ORIGIN`, `TRUST_PROXY`, `SITE_OUT_DIR`, `MEDIA_DIR`, `MEDIA_QUOTA_MB`, `DATA_DIR` (default `data/`), `TEMPLATES_DIR` (default `templates/`), `ENV_FILE`, `INSTALL_TOKEN`, `FORM_RETENTION_MONTHS`, `SMTP_*` (ripiego: di norma si usa Admin → Email). Vedi `.env.example`.

Per la sicurezza dei template: `ADMIN_HOSTS` (gli unici indirizzi da cui `/admin` e `/install` esistono), `ALLOW_TEMPLATE_UPLOAD=0` (spegne il caricamento di zip), `CMS_RENDER_WRAPPER` (comando che avvolge il processo isolato, per esempio `["unshare","-Urn"]`).

## Hosting condiviso (per esempio Infomaniak Node.js)

- Compila l'admin dal pannello del fornitore (o localmente e carica la cartella `.next`).
- Imposta le variabili d'ambiente dal pannello se il file `.env` non è scrivibile: la procedura te lo segnala ai «Requisiti».
- Metti `TRUST_PROXY=1`: dietro il proxy del fornitore l'indirizzo del visitatore viene dall'ultimo valore di `X-Forwarded-For`.
- L'installazione **non è stata provata su Infomaniak**: verifica i requisiti dal passo 2 prima di andare avanti.

## Sicurezza dell'installazione

- `/install` è protetta dalla chiave (inviata in un'intestazione, mai nell'indirizzo) e limita i tentativi; dopo l'installazione risponde con un reindirizzamento all'accesso, le sue azioni rifiutano ogni richiesta e il file della chiave viene cancellato.
- Non lasciare l'app raggiungibile da internet **prima** di aver installato: chi conosce l'indirizzo e la chiave potrebbe installare al tuo posto (la chiave è leggibile solo da chi ha accesso al server).
- **Consigliato in produzione**: admin su un indirizzo separato dal sito pubblico con `ADMIN_HOSTS=admin.cliente.ch`; `ALLOW_TEMPLATE_UPLOAD=0` se i template li installi tu; su un server Linux dove puoi, `CMS_RENDER_WRAPPER` con `unshare` o `bwrap`.
- I template sono codice e il loro isolamento ha **limiti** (rete e segnali non sono limitati da Node, il JavaScript del template gira nel sito pubblico): leggi «Template e sicurezza» in `docs/architettura.md` prima di installare template di terzi.
