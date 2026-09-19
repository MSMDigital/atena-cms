# Catalogo componenti

Ricavato dalle 9 pagine del sito Mammano (variante misto). Elenca i blocchi che l'admin può mettere in una pagina, i campi di ciascuno e cosa è globale al sito. È la descrizione a parole degli schemi in `schema/`, che sono la fonte di verità: se i due divergono vale lo schema.

Sono 14 blocchi presenti oggi più 1 nuovo (Testo ricco). I 59 blocchi delle 9 pagine attuali vengono importati e validano contro gli schemi (`npm run import`, `npm run validate`).

## Legenda dei campi

- **testo**: una riga. **testo lungo**: paragrafi senza formattazione. **testo ricco**: grassetto, corsivo, link, a capo. Il blocco Testo ricco ammette anche titoli h2-h6, elenchi e citazioni.
- **immagine**: dalla libreria media. Testo alternativo per lingua, punto focale (anche separato per mobile).
- **link**: pagina interna (per chiave, mai per URL), URL esterno, ancora, oppure un canale dei dati azienda (telefono, mobile, WhatsApp, email). Nei testi i link interni si scrivono `page:<chiave>` e `channel:<canale>`.
- **pulsante**: etichetta + link + stile (primario, secondario, inverso, WhatsApp). Se il link è un canale e l'etichetta è vuota, si usa il valore del canale.
- Tutti i testi si traducono per lingua (IT, DE, FR): `it` è obbligatorio, le altre lingue ricadono su `it`. Le scelte e i numeri no.

## Panoramica

| # | Blocco | Chiave | Sezioni oggi | Superfici ammesse |
|---|---|---|---|---|
| 1 | Hero | `hero` | 1 | scura |
| 2 | Intestazione pagina | `page-intro` | 8 | scura, chiara |
| 3 | Nastro scorrevole | `marquee` | 9 (condiviso) | brand, scura |
| 4 | Numeri | `facts` | 1 | scura, chiara |
| 5 | Immagine larga | `wide-image` | 1 | nessuna |
| 6 | Galleria | `gallery` | 1 | scura |
| 7 | CTA finale | `cta` | 7 | scura, brand |
| 8 | Voci | `items` | 11 (7 punti, 2 righe, 1 passi, 1 card) | tutte |
| 9 | Testo + immagine | `split` | 8 | tutte |
| 10 | Zone servite | `zones` | 3 | tutte |
| 11 | Domande frequenti | `faq` | 6 | tutte |
| 12 | Tabella dati | `spec-table` | 1 (più una dentro uno split) | tutte |
| 13 | Modulo | `form` | 1 | tutte |
| 14 | Contatti | `contacts` | 1 (più uno dentro il modulo) | tutte |
| 15 | Testo ricco (nuovo) | `rich-text` | 0 | tutte |

## Campi comuni a ogni blocco

- **Superficie**: `light`, `dark` o `brand`, tra quelle ammesse dalla tabella (la prima è il default). Se ce n'è una sola, il selettore non compare.
- **Ancora**: id per i link interni (oggi `noleggio`, `deposito`, `sgomberi`, `imballaggi`). Il validatore controlla che ogni link `pagina#ancora` punti a un'ancora esistente.
- **Visibile**: si/no, per nascondere un blocco senza cancellarlo.
- **Blocco condiviso**: un blocco può essere un riferimento a una copia unica riusata in più pagine (`shared.json`). Oggi solo il Nastro.

### Testata di sezione (blocchi 8, 10, 11, 12, 13, 14)

Le sezioni di contenuto aprono con la stessa testata. È modellata una volta sola e sempre opzionale.

- **Etichetta** (eyebrow): testo breve. Diventa anche la scritta verticale laterale, numerata in automatico.
- **Titolo**, con **livello** h2 (default), h3 o h4. L'aspetto segue la scala tipografica di quel livello.
- **Testo**: testo ricco. Se c'è, titolo e testo stanno affiancati; se manca, il titolo è solo. Non c'è un campo "layout": è automatico.

## I blocchi

### 1. Hero (`hero`)

Solo home, sempre in cima. Superficie fissa.

- immagine, con punto focale desktop e mobile
- titolo riga 1, titolo riga 2 (colore accento, a destra). È l'h1 della pagina.
- claim (una riga per a capo)
- badge circolare: testi che girano attorno, etichetta accessibile, link

### 2. Intestazione pagina (`page-intro`)

Pagine interne, sempre in cima. Alternativa all'Hero: una sola delle due per pagina.

- titolo (h1)
- testo introduttivo (testo ricco, ammette link)
- "In breve": testo. L'etichetta è una stringa fissa del sito. È la risposta diretta pensata per i motori di ricerca AI, consigliata su ogni pagina di servizio.
- pulsanti (0 a 2)
- Le briciole di pane sono automatiche, dalla pagina padre.

### 3. Nastro scorrevole (`marquee`)

Identico in tutte le 9 pagine, quindi **condiviso**.

- voci: testo breve (da 3 a 24; oggi 7)

### 4. Numeri (`facts`)

- etichetta accessibile della fascia (es. "Mammano in numeri")
- 4 voci (il layout è a 4 colonne): valore, etichetta
- Se il valore inizia con una cifra (es. `10'000+`) parte il conteggio animato.

### 5. Immagine larga (`wide-image`)

- immagine (formato 21:9, ritaglio sul punto focale). Nessuna superficie: sta sullo sfondo della pagina.

### 6. Galleria (`gallery`)

Su desktop (JavaScript acceso, senza «riduci animazioni») la sezione resta ferma e la fila di immagini scorre in orizzontale mentre si scende; finita la fila, la pagina riparte. Quanto resta ferma dipende dal numero di immagini (la fila scorre 1,8 volte più veloce della pagina). Su mobile, con animazioni ridotte o senza JavaScript è una fila che si scorre con il dito o il trackpad. Superficie fissa.

- da 3 a 8 immagini: immagine, didascalia
- etichetta verticale della sezione (oggi "Mammano al lavoro"; nel prototipo era scritta nel JS)

### 7. CTA finale (`cta`)

- titolo
- testo (opzionale)
- pulsanti (1 o 2)
- parola verticale grande sullo sfondo (oggi "Traslochi"; nel prototipo era scritta nel JS). Solo desktop.

### 8. Voci (`items`)

Un blocco solo per quattro aspetti che condividono gli stessi campi.

- testata di sezione
- **aspetto**: `points` (punti numerati), `steps` (passi che si accendono allo scroll), `cards` (card con immagine), `rows` (righe a tutta larghezza con anteprima)
- colonne: 2, 3 (default) o 4. Per le card 2 o 3. Ignorato da `steps` e `rows`.
- numerazione automatica: si/no (solo `points`)
- voci: titolo, testo, link, etichetta del link, immagine, immagine di anteprima
  - `cards`: immagine e link obbligatori, tutta la card è cliccabile
  - `rows`: link obbligatorio, l'anteprima segue il cursore su desktop (nel prototipo la mappa link/foto era scritta nel JS)
- Cambiando aspetto i campi non pertinenti restano nei dati: non si perde nulla.
- Il livello del titolo delle voci si deduce da quello della testata, oppure h2 se la testata manca.

### 9. Testo + immagine (`split`)

Usato 8 volte.

- etichetta, titolo (con livello), testo (uno o più paragrafi)
- lato dell'immagine: sinistra o destra
- **immagine su mobile**: sopra o sotto il testo quando le colonne si impilano. Nel sito attuale è già una scelta per sezione, quindi va conservata.
- media, uno tra: immagine, oppure immagine con citazione (testo, autore) come in Chi siamo
- contenuto aggiuntivo, opzionale, uno tra:
  - **elenco**: voci con etichetta in grassetto e/o testo (es. "Altezza: fino a 25 m"). Almeno uno dei due.
  - **tabella dati** (stessa del blocco 12)
- **link con freccia** (`action`), opzionale e indipendente dal contenuto aggiuntivo: la home ha elenco e link insieme

### 10. Zone servite (`zones`)

Le liste oggi non sono identiche: home e Contatti hanno le stesse 9 zone in ordine diverso, Traslochi privati usa una lista più fine (Paradiso, Massagno, Valli).

- testata di sezione
- origine: `company` (le zone dei dati azienda) oppure `custom` (lista propria)
- Le zone servite non sono il JSON-LD `areaServed`: quello è un elenco a parte nei dati azienda (città, cantone, paese), perché non coincide con le zone mostrate.

### 11. Domande frequenti (`faq`)

- testata di sezione
- domande: domanda, risposta (testo ricco)
- prima domanda aperta: si/no
- Il JSON-LD `FAQPage` si genera dal blocco. Oggi è scritto a mano una seconda volta nell'HTML, con il rischio che i due testi divergano.

### 12. Tabella dati (`spec-table`)

Da sola o dentro Testo + immagine.

- testata di sezione
- righe: etichetta, valore
- didascalia (letta dagli screen reader, non visibile)

### 13. Modulo (`form`)

- testata di sezione
- nome del modulo (letto dagli screen reader)
- campi: nome interno, tipo (testo, email, telefono, data, scelta, testo lungo, consenso), etichetta, segnaposto, compilazione automatica, obbligatorio, larghezza (metà o intera), opzioni (per la scelta)
- testo del pulsante, messaggio di conferma, nota sotto il modulo
- colonna laterale opzionale: elenco contatti
- **Invio**: destinatari e oggetto. **Le richieste vengono sempre salvate in MySQL e inviate per email.**
- Il consenso privacy è un campo di tipo `consent` la cui etichetta contiene il link `page:privacy`.

Lato server, da progettare più avanti: elenco delle richieste in admin, esportazione, cancellazione (dati personali, nLPD), protezione antispam, stato di lettura.

### 14. Contatti (`contacts`)

- testata di sezione
- voci: etichetta, valore, link. Con un canale dei dati azienda il valore si legge da lì; per indirizzo e orari il link è vuoto.
- mappa opzionale: indirizzo o luogo, titolo accessibile

### 15. Testo ricco (`rich-text`), nuovo

Non esiste oggi. Serve per Privacy, Note legali e Cookie, che nel footer puntano a pagine inesistenti. È anche il blocco dove si usano h2-h6.

- contenuto: titoli h2-h6, paragrafi, elenchi puntati e numerati, citazioni, link
- larghezza: colonna di lettura o larga

## Dati globali del sito (`content/site.json`)

- **Indirizzo del sito**: base di canonical, hreflang, sitemap e JSON-LD.
- **Lingue**: predefinita, **abilitate** (quelle online: decidono percorsi e menu lingua) e il tag di ciascuna (`it-CH`). Il selettore lingua compare solo con più di una lingua online. Oggi solo IT: i DE/FR del prototipo puntavano a pagine inesistenti.
- **Azienda**: nome, altri nomi, claim, anno di fondazione, titolare, indirizzo, coordinate, **canali** (telefono, mobile, WhatsApp, email), orari, fascia di prezzo, **zone servite**, area servita e lingue parlate (per il JSON-LD), logo e immagine principale (file), social. Oggi telefono ed email sono riscritti a mano decine di volte (ogni CTA, header, footer, barra mobile, JSON-LD): con i canali come riferimento si cambiano in un punto.
- **Logo**: marchio, nome, claim. Oggi è un marchio ricostruito in HTML, provvisorio.
- **Navigazione**: albero a 2 livelli.
- **Header**: pulsante d'azione, telefono visibile.
- **Footer**: claim, colonne di link (le voci possono essere solo testo), link legali, copyright.
- **Contatto rapido**: i 3 pulsanti della barra mobile e il pulsante WhatsApp flottante.
- **Testi fissi**: micro-testi dell'interfaccia da tradurre ("Vai al contenuto", "In breve", "(facoltativo)"...).
- **SEO**: nome del sito, icona, immagine di condivisione predefinita.

## Dati di ogni pagina

Chiave stabile (usata dai link), stato (bozza o pubblicata), indirizzo per lingua, pagina padre (per le briciole), nome breve (menu e briciole), titolo SEO, descrizione SEO, immagine di condivisione, `noindex`, servizio (nome e zona: genera il JSON-LD `Service`), blocchi.

**Indirizzi.** Sono gerarchici e tradotti: prefisso della lingua (tranne la predefinita) + slug di ogni pagina padre + slug della pagina, per esempio `/servizi/traslochi-privati/` e `/de/dienstleistungen/privatumzuege/`. Lo slug può differire dalla chiave (`preventivo` → `/preventivo-trasloco/`).

## Generato in automatico

Briciole di pane, scritta verticale numerata delle sezioni, JSON-LD (`Organization` in home, `WebPage`, `Service`, `BreadcrumbList`, `FAQPage`), `hreflang` (solo con più lingue online), sitemap e robots, `canonical`, `theme-color` (dai token), dimensioni delle immagini, spaziatura tra sezioni con la stessa superficie, barra di lettura, animazioni (conteggio, entrate, accensione di passi e zone).

## Regole

- Hero e Intestazione pagina: una sola per pagina, sempre in cima, mutuamente esclusive.
- Tutto il resto in ordine libero. Il CMS non impone template di pagina.
- Il renderer separa etichetta e testo di un elenco con uno spazio, tranne davanti a virgola, punto e simili (nel sito il testo può iniziare con ", anche completamente arredati").

## Decisioni prese

- Le quattro liste di voci (punti, passi, card, righe) sono **un blocco solo**, con l'aspetto da scegliere.
- Nastro **condiviso**; telefono, email, indirizzo e zone servite **nei dati azienda**, richiamati dai blocchi (le Zone possono avere una lista propria).
- **Testo ricco** come blocco nuovo per le pagine legali.
- Il modulo **salva le richieste** in MySQL, oltre a inviare l'email.
- **Niente note interne** nei blocchi. I riquadri "Da verificare con il cliente" del prototipo sono stati tolti dal progetto (restano nel git di `projects/mammano`).

## Da sapere e ancora aperto

- **Pagine legali mancanti.** Privacy, Note legali e Cookie sono citate dal footer e dal consenso del modulo ma non esistono. Il validatore le segnala come avvisi. Serve il testo dal cliente o da un legale; il blocco per scriverlo c'è.
- **Testo sotto il modulo.** Nel prototipo dice "Campi obbligatori come da riunione dell'11.09.2026…": è di fatto una nota interna e va riscritto prima della pubblicazione.
- **Mappa e cookie.** La mappa incorporata carica subito e il sito non ha un banner cookie. Va caricata solo dopo il consenso; il banner è una funzione del CMS da prevedere.
- **Modulo senza backend.** Il modulo generato usa ancora il comportamento del prototipo (nessun invio reale, solo il messaggio di conferma). Salvataggio in MySQL, email e antispam arrivano con il backend.
- **Valori dedotti dall'importazione.** Il punto focale dell'hero, la parola verticale della CTA e le anteprime dell'elenco servizi stavano nel CSS e nel JS. Destinatari e oggetto del modulo non erano nell'HTML: ho messo l'email dell'azienda e "Richiesta di preventivo", da confermare.
