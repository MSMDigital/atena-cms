-- Libreria media: titolo, testo alternativo, didascalia e descrizione anche nelle altre lingue del sito. Le colonne esistenti restano
-- quelle della lingua di base; qui (JSON) stanno le altre: { "en": { "alt": "…", "title": "…", "caption": "…", "description": "…" } }.
ALTER TABLE media ADD COLUMN meta_i18n LONGTEXT NULL;
