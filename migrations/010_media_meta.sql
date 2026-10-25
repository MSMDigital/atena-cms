-- Libreria media: titolo, didascalia e descrizione di ogni immagine (il testo alternativo c'è già: colonna alt).
ALTER TABLE media
  ADD COLUMN title VARCHAR(200) NULL,
  ADD COLUMN caption VARCHAR(500) NULL,
  ADD COLUMN description TEXT NULL;
