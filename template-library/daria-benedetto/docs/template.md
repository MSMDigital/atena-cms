# Daria Benedetto

Template per coach, consulenti e formatori, costruito su un sito personale a più pagine (versione 2.1.0, dal sito del 23/10/2026). Include il **blog («Pensiero»)** con categorie, articoli, elenco con filtri e pagine di categoria generate dal motore.

- **Palette** (Admin → Stile): terracotta `#B9472B` (marchio), teal `#123A42` (superficie scura), azzurro tenue `#D7EEF1` (superficie «brand»), bianco (chiara). Caratteri: Outfit (titoli) e DM Sans (testi), scaricati dal server e serviti in locale.
- **Blocchi** (`schema/blocks.json`): `hero-portrait` (anche con pulsante-logo), `statement`, `steps`, `feature`, `logos` (fino a 40), `reviews`, `timeline`, `points` (anche «riquadri» con icona, numero, colore e aside numerico), `columns`, **`booking`** (prenotazione online con schede che aprono il calendario), **`partners`** (riquadro con loghi, es. welfare), `cta`, `callout`, `text`, `rich-text`, `form`, `posts-list`.
- **Header e footer** (Admin → Header / Footer): nome e sottotitolo, menu **con tendine** (voce → campo «Tendina»: link, titolo del gruppo, voci con icona, durata ed etichetta), pulsante; nel footer presentazione, loghi, link, social e firma.
- **Pagine di esempio**: home, il mio percorso, coaching professionale, aziende & formazione, pensiero (blog), contatti, privacy (bozza). La pagina Speaking è stata rimossa (non c'è più nel sito).
- **Da sostituire**: i link Calendly delle sessioni (menu e blocchi «Prenotazione»), le recensioni tra parentesi quadre, l'email di consegna dei moduli (`info@dariabenedetto.it`), l'indirizzo e i testi dei cinque articoli di esempio.
- **Ritratti**: i PNG ritagliati (`ritratto-*.png`) stanno nella cornice «ad arco»; le fotografie (`.jpg`) in quella «arrotondata».

Comandi: `npm run validate -- --template daria-benedetto`, `npm run build -- <cartella> --template daria-benedetto`, `npm run template:pack -- templates/daria-benedetto` (richiede Node 20.9 o più recente).

**Micro animazioni** (`assets/css/site.css`, in fondo, e `assets/js/main.js`): comparsa allo scroll con ritardo a cascata, arco e cerchi della copertina, numero che conta, sottolineatura del menu, schede e pulsanti che si sollevano, zoom delle immagini, ombra dell'header allo scroll. Tutto sotto `prefers-reduced-motion: no-preference`; con `?shot` nell'indirizzo gli elementi sono già visibili (utile per le schermate).

**Novità 2.1.0**: menu con tendine di prenotazione; blocchi `booking` e `partners`; riquadri (`points` → aspetto «Riquadri»); 29 loghi cliente reali (home e aziende); loghi welfare Jointly/Edenred; home riordinata (loghi dopo la copertina, «Dall'ascolto al cambiamento» spostato in Coaching); link esterni in nuova scheda. Il pacchetto usa lo stesso `id` della 1.0.0: si installa come aggiornamento.
