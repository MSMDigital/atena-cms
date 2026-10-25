# Atena CMS: guida per chi lo installa e gestisce il sito

Questa guida accompagna chi installa Atena CMS, lo configura la prima volta e poi lo usa ogni giorno per gestire i contenuti. Non serve saper programmare. Le parti tecniche (server, database, sicurezza avanzata) sono nella [documentazione tecnica](documentazione-tecnica.md): dalle a chi si occupa del server.

## 1. Come funziona, in breve

- Atena CMS è il **pannello di gestione** (l'admin). Il **sito** che vedono i visitatori è un **template**: un design con i suoi blocchi (copertina, testo, galleria, modulo di contatto…).
- Tu scrivi e modifichi i contenuti nel pannello. Le modifiche restano **bozze** finché non premi **Pubblica**: solo allora il sito online cambia.
- Il sito pubblicato è fatto di pagine statiche: veloce e sicuro.

## 2. Cosa serve prima di installare

Chiedi al tuo tecnico o al fornitore dell'hosting di preparare:

| Cosa | Dettaglio |
|---|---|
| Un server o hosting con **Node.js 22.12 o più recente** | l'hosting «Node.js» di Infomaniak va bene |
| Un **database MySQL 8** (o MariaDB 10.6+) **vuoto** | con nome, utente e password |
| Un **dominio** con certificato HTTPS | per esempio `www.tuosito.ch`; consigliato un indirizzo separato per il pannello (`admin.tuosito.ch`) |
| L'accesso per caricare i file del CMS | git, FTP o il pannello dell'hosting |
| I dati del **server email** (SMTP) | server, porta, utente, password e indirizzo mittente; oppure una chiave API di Brevo. Servono per ricevere per email le richieste dei moduli |

Tieni a portata di mano anche logo, immagini e testi del sito.

## 3. Installazione

1. **Carica il CMS** sul server e fai avviare l'applicazione (il tecnico esegue `npm ci`, `npm run build:admin` e `npm start`).
2. Apri nel browser `https://<il-tuo-indirizzo>/install`.
3. Ti viene chiesta la **chiave di installazione**. La trovi nel registro del server (riga «Chiave di installazione») oppure nel file `data/install-token`.
4. Segui la procedura guidata:
   1. **Requisiti**: il CMS controlla da solo che il server sia adatto. Se qualcosa non va, te lo dice (di solito: versione di Node troppo vecchia).
   2. **Database**: inserisci server, porta, nome, utente e password. Il CMS prova la connessione, crea le tabelle e salva la configurazione. La password del database non può contenere i caratteri `$ ' " \ ` #`.
   3. **Primo amministratore**: nome, email e password (almeno 12 caratteri, con almeno tre tipi tra minuscole, maiuscole, numeri e simboli).
   4. **Template**: scegli **Starter** (già selezionato) e indica l'indirizzo pubblico del sito. Vengono caricati i contenuti di esempio e il sito viene pubblicato subito.
   - Se stai **spostando un sito esistente** da un altro server, dopo il passo «Database» scegli **Ripristina da un backup** e carica il pacchetto.
5. Finito: la pagina `/install` si chiude per sempre. Da ora accedi dal pannello, all'indirizzo `/admin`.

> Vuoi usare un template diverso da Starter (per esempio quello di un cliente)? Chiedi il file `.zip` del template e caricalo al passo «Template», oppure più tardi da **Aspetto → Template**.

## 4. Prima configurazione (consigliata, in quest'ordine)

Dopo l'installazione il sito contiene pagine di esempio. Per renderlo tuo:

1. **Impostazioni → Dati del sito**: indirizzo del sito, nome, marchio, contatti, testi fissi.
2. **Impostazioni → SEO & Geo**: compila *Organizzazione* (nome, contatti, indirizzo, orari, social) e i *fatti chiave*. Servono a Google e ai motori di ricerca con intelligenza artificiale.
3. **Aspetto → Stile**: colori, caratteri, pulsanti. Poi **Header** e **Footer** (logo, menu, link in basso) e **Navigazione**.
4. **Impostazioni → Email**: scegli come inviare le email (server SMTP oppure Brevo), inserisci i dati e premi **Email di prova**. Controlla anche la cartella spam. Senza questa configurazione le richieste dei moduli si salvano comunque in **Richieste**, ma non arrivano per email.
5. **Pagine**: scrivi le tue pagine. Elimina o metti in bozza quelle di esempio che non servono (finiscono nel Cestino e si possono ripristinare). Completa la pagina **Privacy**: finché contiene i segnaposto `[DA COMPLETARE…]` la pubblicazione ti avvisa.
6. **Consenso e statistiche**: in **Dati del sito** imposta il consenso per le mappe e, se li usi, gli script di statistica.
7. **Lingue** (facoltativo): **Impostazioni → Lingue** per aggiungere altre lingue ai contenuti.
8. **Impostazioni → Generale**: lingua del pannello, formato di data e ora, fuso orario.
9. **Pubblica** (pulsante in alto/nella barra laterale).

Mentre prepari il sito, in **SEO & Geo → Crawling** lascia il sito **Chiuso** ai motori di ricerca; mettilo su **Aperto** quando vai online. Il tecnico può anche proteggere tutto il sito con una password temporanea.

### Sicurezza dell'accesso: da fare subito

- Cambia la password dell'utente di prova e **elimina** gli utenti temporanei (**Utenti**).
- **Impostazioni → Login sicuro**: scegli un indirizzo di accesso tuo al posto di `/admin/login` (per esempio `/entrata-7k2x/`). Segnatelo: quello standard smetterà di funzionare.
- Fai un primo **backup** (vedi sezione 10).

## 5. Il pannello: dove trovare le cose

| Voce del menu | A cosa serve |
|---|---|
| **Bacheca** | stato della pubblicazione, numero di pagine, articoli e richieste degli ultimi 7 giorni, informazioni sul CMS (versione, template, **lingue del sito** con i loro nomi, indirizzo), riepilogo di cosa puoi fare |
| **Articoli** | blog: articoli, categorie, tag (se il template ha il blog) |
| **Media** | libreria delle immagini |
| **Pagine** | tutte le pagine, creazione di nuove, blocchi condivisi |
| **Richieste** | messaggi inviati dai moduli del sito |
| **Utenti** | chi può accedere e con quale ruolo |
| **Aspetto** | stile, navigazione, header, footer, template |
| **Impostazioni** | generali, lingue, pagina 404, dati del sito, SEO & Geo, email, API, login sicuro, backup |

Il tuo nome in alto/nella barra apre il **profilo**, dove cambi nome, immagine e password.

## 6. Gestire i contenuti

### Pagine

1. **Pagine → Aggiungi pagina**: scegli un nome e l'indirizzo (l'indirizzo identifica la pagina nei link e **non si cambia** dopo). Con più lingue, nelle impostazioni della pagina ogni scheda di lingua ha il suo campo **Indirizzo · lingua**.
2. La pagina è una **lista di blocchi**. **Aggiungi** un blocco (copertina, testo, galleria, modulo…), compila i campi, **sposta su/giù**, **duplica** o **elimina** i blocchi.
3. A fianco vedi l'**anteprima della pagina con le modifiche non ancora salvate**, anche in versione desktop e mobile.
4. **Salva bozza** salva senza pubblicare. Se esci con modifiche non salvate, il pannello te lo ricorda.
5. Per ogni pagina trovi i campi **SEO** (titolo, descrizione, parola chiave, immagine di condivisione) e **GEO** (riassunto per i motori con intelligenza artificiale). Un semaforo ti dice cosa manca. Puoi anche scegliere **Non indicizzare** (esclude la pagina dai motori di ricerca) o proteggerla con una **password**.
6. Se il template lo prevede, scegli quale **header** e **footer** usa la pagina.

**Testi ricchi**: usa i pulsanti sopra il campo (grassetto, corsivo, elenchi, link). Incollare formattazione dall'esterno non è ammesso: il pannello ti avvisa.

### Blocchi condivisi

Un blocco che compare in più pagine (per esempio un invito a contattarti) si scrive una volta sola in **Pagine → Blocchi condivisi** e si inserisce nelle pagine con il blocco «Blocco condiviso». Modificandolo cambia ovunque.

### Articoli (blog)

**Articoli → Aggiungi articolo**: titolo, riassunto, immagine, categorie, tag, autore, data e contenuto a blocchi. Sono visibili sul sito sotto l'indirizzo del blog. Un articolo può essere:

- **Bozza**: non online.
- **Pubblicato**.
- **Pianificato**: scegli data e ora intera di pubblicazione; esce da solo all'ora indicata.

Categorie e tag si creano da **Articoli → Categorie / Tag**.

**Articoli da Claude o da altri programmi**: possono arrivare da fuori come bozze, tramite l'API (vedi la sezione 10).

### Media (immagini)

- **Carica** immagini JPG, PNG, WebP o SVG (peso massimo 10 MB di default). Vengono ridimensionate e ottimizzate da sole.
- Per ogni immagine compila **Titolo**, **Testo alternativo** (importante per accessibilità e SEO), **Didascalia** e **Descrizione**, anche per ogni lingua.
- **Ritaglia o ridimensiona…** per correggere un'immagine. **Sostituisci** il file mantenendo gli stessi usi.
- Vedi **dove è usata** ogni immagine. Un'immagine in uso non si può eliminare.
- Negli editor, il **punto focale** decide quale parte dell'immagine resta al centro quando viene ritagliata.

### Stile, header, footer, navigazione

- **Aspetto → Stile**: colori, scala dei testi, caratteri e pulsanti valgono per tutto il sito.
- **Navigazione**: voci del menu e struttura dei link.
- **Header / Footer**: puoi averne più d'uno (per esempio uno completo e uno minimale) e scegliere quale usa ogni pagina.
- **Logo**: nell'header puoi caricare un logo e scegliere **dove porta un clic** (una pagina del sito, un indirizzo esterno o un contatto). Se non indichi nulla, porta alla home.

### Cestino

Pagine e articoli eliminati vanno nel **Cestino**. Da lì li **ripristini** (tornano in bozza) o li **elimini per sempre**. Una pagina usata da altre pagine non si può eliminare finché è collegata.

### Pubblicare

1. Controlla le anteprime.
2. Premi **Pubblica**. Il CMS controlla tutti i contenuti: se c'è un problema l'elenco è cliccabile e ti porta al campo da correggere; **finché non è risolto non cambia nulla online**.
3. Se tutto va bene, il sito è aggiornato. La Bacheca mostra data e ora dell'ultima pubblicazione e quante modifiche sono in attesa.

> Solo gli **amministratori** possono pubblicare.

## 7. Richieste dei moduli

I moduli del sito (per esempio «Contatti») salvano ogni messaggio in **Richieste** e lo inviano per email ai destinatari impostati.

- Stati: **Nuova**, **Letta**, **Archiviata**. La Bacheca conta quelle arrivate negli ultimi 7 giorni.
- Aprendo una richiesta vedi i campi, il consenso privacy e se l'email è partita (**Inviata**, **Non inviata**, **Non configurata**).
- I destinatari si impostano nel blocco modulo della pagina; mittente e server in **Impostazioni → Email**.
- Nei campi del modulo, la **casella di consenso** (per esempio l'informativa privacy) ha, oltre all'etichetta con il link, un **titolo** (il suggerimento che compare al passaggio del mouse), una **classe CSS** facoltativa per lo stile e la scelta se i link dell'etichetta si aprono **nella stessa scheda o in una nuova**.
- Se le email non arrivano: rifai **Email di prova**, controlla lo spam e verifica che il mittente appartenga al dominio autorizzato dal server di posta.
- Per tutela della privacy, il tecnico può far eliminare automaticamente le richieste più vecchie di un certo numero di mesi.

## 8. Utenti e ruoli

**Utenti → Aggiungi utente**. Ruoli:

| Ruolo | Cosa può fare |
|---|---|
| **Amministratore** | tutto: pubblicare, impostazioni, utenti, stile, template, backup |
| **Autore** | crea e modifica i **propri** articoli, pagine e immagini, salvandoli come **bozze**; un amministratore li pubblica |
| **Normale** | nessun privilegio sui contenuti: può solo aggiornare il proprio profilo e la password |

Puoi disattivare un account senza eliminarlo («Account attivo»). Eliminando un utente i suoi contenuti restano sul sito, senza proprietario. Le password devono avere almeno 12 caratteri.

## 9. SEO, lingue e pagina 404

- **SEO & Geo** (Impostazioni): organizzazione, descrizione per i motori con intelligenza artificiale, fatti chiave, regole per i crawler. `robots.txt` e `sitemap.xml` si aggiornano da soli a ogni pubblicazione.
- **Lingue** (Impostazioni → Lingue): aggiungi una lingua e il CMS crea le versioni in bozza di pagine e articoli; ogni versione ha testi, indirizzo e SEO propri. Quando aggiungi la prima lingua ti chiede in che lingua sono scritti i contenuti attuali.
- **404** (Impostazioni → 404): la pagina che vedono i visitatori quando l'indirizzo non esiste.

## 10. Backup e manutenzione

- **Impostazioni → Backup → Crea backup**: scarica un pacchetto con database, immagini e template. Puoi includere il sito pubblicato e la chiave delle password email. **Fai un backup prima di ogni aggiornamento e a intervalli regolari**, e conservalo fuori dal server.
- **Ripristino**: dal pannello, con la tua password e la parola RIPRISTINA (il CMS fa prima una copia di sicurezza); oppure su un nuovo server dall'installazione guidata.
- **Aggiornamenti del CMS**: li fa il tecnico (sostituisce i file, aggiorna il database, riavvia). I tuoi contenuti non vengono toccati.
- **Cambiare template**: **Aspetto → Template**. Puoi attivarne un altro mantenendo i contenuti attuali oppure sostituendoli con quelli di esempio; la copia precedente viene salvata sul server.

### API: inviare articoli da Claude o da altri programmi

Un programma esterno (per esempio Claude, se ha uno strumento per fare richieste web, come Claude Code) può inviare un articolo con titolo, testo e immagine. L'articolo arriva sempre come **bozza**: non va mai online da solo. Un amministratore lo controlla in **Articoli** e lo pubblica.

**Attivarla (una volta)**

1. Il tecnico aggiorna il CMS (vedi la documentazione tecnica) ed esegue `npm run db:migrate`.
2. Come amministratore vai in **Impostazioni → API**.
3. In **Nuovo token** scegli un nome (per esempio «Claude»), l'utente che comparirà come **autore degli articoli** e la scadenza (consigliati 90 giorni).
4. Premi **Crea token** e **copialo subito**: non si vedrà più. Tienilo in un posto privato (un gestore di password o una variabile d'ambiente), mai in pagine pubbliche o nel repository.
5. Prova che risponda: l'indirizzo `https://<indirizzo-admin>/api/posts` aperto senza token deve dare «Non autorizzato».

Se l'admin è su un indirizzo separato (`admin.tuosito.ch`), l'API sta lì, non sul dominio del sito.

**Le istruzioni da dare a Claude** (sostituisci l'indirizzo; il token mettilo in una variabile `ATENA_API_TOKEN`, non nel testo):

```
Per pubblicare un articolo sul blog usa l'API di Atena CMS. L'articolo arriva sempre come BOZZA:
non si pubblica da qui, lo controlla una persona.

Endpoint: POST https://admin.tuosito.ch/api/posts
Intestazioni: Authorization: Bearer $ATENA_API_TOKEN  e  Content-Type: application/json

Corpo JSON:
- title (obbligatorio, 3-200 caratteri)
- text (obbligatorio, max 100.000 caratteri), in markdown semplice:
  paragrafi separati da una riga vuota, # o ## per i titoli, ### per i sottotitoli,
  elenchi con "- " o "1. ", citazioni con "> ", **grassetto**, *corsivo*, [testo](https://...).
  Niente HTML. Non ripetere il titolo dentro il testo.
- image (facoltativa): { "data": "<immagine in base64>", "filename": "nome.jpg", "alt": "descrizione dell'immagine" }
  Solo JPG, PNG o WebP, massimo 10 MB. Non SVG. Non si possono passare indirizzi di immagini: va inviato il file in base64.

Risposta: 201 {"ok":true,"key":"...","status":"draft"}.
Errori: 401 token non valido, 422 dati non validi (il campo "error" spiega cosa correggere),
429 troppe richieste (massimo 20 articoli all'ora).
Dopo l'invio riporta la chiave dell'articolo e ricorda che va controllato e pubblicato da Admin → Articoli.
```

Una prova a mano, da terminale:

```sh
curl -X POST https://admin.tuosito.ch/api/posts \
  -H "Authorization: Bearer IL_TUO_TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Prova API","text":"Primo paragrafo.\n\n## Un titolo\n\nTesto con **grassetto**."}'
```

Per convertire un'immagine in base64: `base64 -i foto.jpg | tr -d '\n'` (Mac) oppure `base64 -w0 foto.jpg` (Linux).

**Dopo l'invio.** Apri **Articoli**: la bozza è lì, a nome dell'utente del token. Aggiungi categorie e tag, controlla il testo e l'immagine, poi pubblica come per ogni altro articolo.

**Sicurezza.**

- Il token non si può rivedere. Se si perde, si crea un altro; se finisce dove non deve, **Revoca** in Impostazioni → API e smette di funzionare subito.
- Se l'utente del token viene disattivato o eliminato, il token non funziona più.
- Dopo troppi tentativi con un token sbagliato l'indirizzo viene bloccato per un po'; ogni utente può inviare al massimo 20 articoli all'ora.
- Nessuna immagine viene scaricata da un indirizzo: l'immagine deve essere inviata insieme all'articolo.

## 11. Domande frequenti

**Ho pubblicato ma il sito non cambia.** Svuota la cache del browser (ricarica forzata). Controlla in Bacheca che «Nessuna modifica in attesa» e l'ora dell'ultima pubblicazione siano quelle attese.

**La pubblicazione dà un errore.** Apri l'elenco dei problemi: ogni voce porta al campo da correggere (per esempio un link a una pagina in bozza o un'immagine mancante). Gli avvisi non bloccano, gli errori sì.

**Ho perso la password.** Un altro amministratore può reimpostarla da **Utenti**; altrimenti il tecnico può farlo da terminale.

**Non riesco più ad accedere all'admin.** Se hai impostato un indirizzo di accesso personalizzato, usa quello: `/admin/login` non funziona più per chi non è già dentro. Il tecnico può ripristinarlo da terminale.

**L'API risponde «Non autorizzato».** Controlla che il token sia scritto per intero (`atn_…`), che non sia scaduto o revocato (Impostazioni → API) e che l'utente del token sia attivo.

**L'admin dà «non trovato» da `www`.** Se il tecnico ha limitato l'admin a un indirizzo (per esempio `admin.tuosito.ch`), `/admin` esiste solo lì. Se hai un indirizzo di accesso personalizzato, l'accesso è `https://admin.tuosito.ch/<tuo-indirizzo>/login`.

**Voglio un sito diverso.** Cambia template da **Aspetto → Template** o installane un altro: il pannello resta lo stesso.

**Dove chiedo aiuto?** Al tecnico che ha installato il CMS, indicando versione del CMS e template (li trovi nella Bacheca, riquadro «Informazioni sul CMS»).
