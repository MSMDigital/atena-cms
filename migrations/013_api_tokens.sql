-- Token per l'API degli articoli (POST /api/posts): servono a un programma esterno (per esempio Claude) per inviare articoli in bozza.
-- Nel database c'è solo lo SHA-256 del token (che è casuale e di 256 bit): una copia del database non permette di usarlo. Il token in chiaro si vede una volta sola, alla creazione.
--   user_id     l'utente a cui appartengono gli articoli creati (admin o autore); se viene disattivato o eliminato il token smette di funzionare
--   expires_at  facoltativa; revoked_at: revocato da un admin
CREATE TABLE api_tokens (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(100) NOT NULL,
  token_hash   CHAR(64) NOT NULL,
  prefix       VARCHAR(12) NOT NULL,
  user_id      INT UNSIGNED NOT NULL,
  created_by   INT UNSIGNED NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at   DATETIME NULL,
  revoked_at   DATETIME NULL,
  last_used_at DATETIME NULL,
  last_ip      VARCHAR(45) NULL,
  UNIQUE KEY uq_api_tokens_hash (token_hash),
  KEY idx_api_tokens_user (user_id),
  CONSTRAINT fk_api_tokens_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_api_tokens_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
