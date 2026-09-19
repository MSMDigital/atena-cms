-- Libreria media: le immagini del progetto (assets/img) e quelle caricate dall'admin (cartella MEDIA_DIR).
--   source        'project' = file del progetto, 'upload' = caricato da un utente (l'unico eliminabile dall'admin)
--   original_name nome del file com'era prima del caricamento
--   alt           testo alternativo predefinito, proposto quando l'immagine viene scelta in un blocco
--   mtime         data di modifica del file (ms): permette di riconoscere i file cambiati nella scansione
ALTER TABLE media
  ADD COLUMN source ENUM('project', 'upload') NOT NULL DEFAULT 'project',
  ADD COLUMN original_name VARCHAR(255) NULL,
  ADD COLUMN alt VARCHAR(300) NULL,
  ADD COLUMN mtime BIGINT NULL;
