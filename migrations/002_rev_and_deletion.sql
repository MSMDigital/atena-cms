-- `rev` cresce a ogni salvataggio della bozza: serve a rilevare che due persone modificano lo stesso documento.
-- `deleted_at`: un documento già pubblicato non si cancella subito; sparisce dal sito alla prossima pubblicazione.
ALTER TABLE docs
  ADD COLUMN rev INT UNSIGNED NOT NULL DEFAULT 1,
  ADD COLUMN deleted_at DATETIME NULL;
