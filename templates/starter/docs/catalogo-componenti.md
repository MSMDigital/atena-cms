# Catalogo moduli — Starter

Il template Starter ha 3 blocchi di base, 17 moduli e 12 moduli interni (stile neutro, segue i token), più lo slider. `content/pages/moduli.json` (pagina `/moduli`, non indicizzata) li mostra tutti: è il campionario, da cancellare nei siti veri.

Gli schemi in `schema/blocks.json` restano la fonte di verità.

## Campi comuni

- **Spaziatura della sezione (padding)**: sopra/sotto `nessuno / molto piccolo / piccolo / medio / grande / molto grande` (medio = valore standard del sito, si adatta allo schermo), sinistra/destra `nessuno / piccolo / medio / grande`. Disponibile su tutti i moduli con sezione propria (non su Copertina con scene, Dittico, Contatto, Profilo, Contatto diretto, che hanno una composizione a cornice).
- **Angoli delle immagini (corners)**: `angoli vivi / poco / arrotondati / molto arrotondati / ad arco`, su ogni modulo con immagini. Il valore di partenza è quello del modulo (ad arco dove nel prototipo lo era).
- **Superficie**: chiara / scura / colore del marchio.

## Moduli

| Tipo | Cosa fa |
|---|---|
| `hero`, `text`, `form` | Base: copertina di testo, testo libero, modulo di contatto |
| `hero-slides` | Copertina a tutta altezza con scene che si alternano |
| `the-need` | Intro, immagine larga, due colonne, citazione |
| `manifesto` | Lettera con capolettera e immagine in cornice |
| `services` | Da 1 a 6 schede con immagine |
| `seasons` | Dittico: due metà affiancate con immagine ed elenco |
| `protocols` | Da 2 a 4 colonne con immagine, etichetta, testo, elenco |
| `technical-direction` | Profilo con teaser verso un'altra pagina, certificazioni, pilastri |
| `heritage` | Fotografia con citazione |
| `discretion` | Frase grande con risposta e due righe |
| `faq` | Domande a fisarmonica |
| `partners` | Partner/loghi, scorrevole oltre i 5 |
| `contact`, `direct-line` | Contatto con foto / senza foto |
| `founder`, `story`, `certifications-full`, `bespoke-services` | Profilo, storia con linea del tempo, certificazioni, griglia servizi con scheda regalo |
| `slider` | Immagini scorrevoli (sotto) |

## Moduli interni

Ognuno sta in un `<div class="mm">` e il suo CSS (`assets/css/mm.css`) è tutto sotto `.mm`; il JS è `assets/js/mm.js`. Pagina demo: `/moduli-interni` (testi di esempio, da cancellare nei siti veri).

| Tipo | Cosa fa |
|---|---|
| `hero-image` | Copertina con immagine, titolo su due righe, claim e badge rotondo  |
| `page-intro` | Apertura delle pagine interne: briciole, titolo, testo, riquadro «In breve» |
| `marquee`, `facts`, `wide-image`, `gallery`, `cta` | Nastro di parole, quattro numeri che contano, immagine larga, galleria fissata che scorre in orizzontale, invito finale con parola verticale |
| `items` | Punti numerati, passi, card con immagine o elenco a righe con anteprima |
| `split` | Testo accanto a immagine o a citazione |
| `zones`, `spec-table`, `contacts`, `rich-text` | Zone in grande, tabella dati, contatti con mappa (dopo il consenso), testo legale |

Non portati perché già coperti: `faq` (c'è già nei moduli) e `form` (resta quello di Starter, ora con testata, nota e colonna contatti facoltative). Le zone si scrivono sempre a mano; i pulsanti non hanno icone dei canali; un link a un canale (telefono, WhatsApp) richiede i dati azienda, che Starter non ha: usare un link URL (`tel:`, `mailto:`). Le stringhe «briciole» e «In breve» sono facoltative in Testi fissi.

## Slider

- **Immagini visibili insieme**: desktop (≥1024 px), tablet (700–1023 px), mobile (<700 px), da 1 a 6 ciascuno. Lo CSS usa `--pv-d/--pv-t/--pv-m` (`assets/css/modules.css`).
- Spazio tra le immagini, proporzioni (1:1, 4:3, 3:2, 16:9, 3:4, 4:5, naturali), angoli, frecce, puntini, scorrimento automatico con intervallo in secondi.
- Ogni immagine può avere didascalia e link. Con una sola schermata frecce e puntini spariscono.

## Il segno e la pagina protetta

`brand.sign` (Dati del sito → Marchio) è facoltativo: se c'è, i moduli lo usano come separatore. `page.protected` funziona: `render/gate.mjs` e `assets/js/gate.js` hanno testi fissi in italiano.

## Header e footer

Si gestiscono da Admin → Header e Footer: ognuno ha un nome («default» è quello usato dalle pagine che non ne scelgono uno), si duplica e si elimina. Ogni pagina sceglie il suo da Impostazioni della pagina → Header / Footer (o «Nessuno»). Header: nome o logo, menu (ogni voce con una classe CSS facoltativa), **menu a hamburger** (sempre, mai, oppure sotto una larghezza in px a scelta), pulsante, superficie, fisso in alto. Footer: testo, colonne di link, link legali, superficie, preferenze cookie. Il menu e il piè di pagina di Dati del sito servono solo ai siti che non hanno ancora header e footer.
