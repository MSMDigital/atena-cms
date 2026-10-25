-- Utenti: nome utente, nome e cognome, profilo (descrizione, immagine, social) e dati SEO/GEO dell'autore; tre ruoli.
--   admin   = Amministratore: gestisce tutto (utenti, contenuti, impostazioni)
--   author  = Autore: crea e modifica i propri contenuti (articoli, pagine, immagini)
--   normal  = Normale: per ora nessun privilegio
-- I vecchi «editor» diventano autori. Un contenuto è «proprio» se l'ha creato l'utente (docs.created_by) o se l'admin l'ha assegnato come autore.
ALTER TABLE users MODIFY role ENUM('admin', 'editor', 'author', 'normal') NOT NULL DEFAULT 'author';
UPDATE users SET role = 'author' WHERE role = 'editor';
ALTER TABLE users
  MODIFY role ENUM('admin', 'author', 'normal') NOT NULL DEFAULT 'author',
  ADD COLUMN username VARCHAR(60) NULL,
  ADD COLUMN first_name VARCHAR(80) NULL,
  ADD COLUMN last_name VARCHAR(80) NULL,
  ADD COLUMN description TEXT NULL,
  ADD COLUMN avatar VARCHAR(255) NULL,
  ADD COLUMN linkedin VARCHAR(300) NULL,
  ADD COLUMN socials TEXT NULL,
  ADD COLUMN seo TEXT NULL,
  ADD COLUMN show_public TINYINT(1) NOT NULL DEFAULT 1;

-- Nome utente per chi c'è già: la parte prima della @ dell'email (solo caratteri ammessi), con l'id se serve a renderlo unico.
UPDATE users SET username = LOWER(REGEXP_REPLACE(SUBSTRING_INDEX(email, '@', 1), '[^a-zA-Z0-9._-]', '')) WHERE username IS NULL;
UPDATE users SET username = CONCAT('utente-', id) WHERE username IS NULL OR CHAR_LENGTH(username) < 3;
UPDATE users u JOIN (SELECT username FROM users GROUP BY username HAVING COUNT(*) > 1) d ON d.username = u.username SET u.username = CONCAT(u.username, '-', u.id);
UPDATE users SET first_name = SUBSTRING_INDEX(name, ' ', 1), last_name = NULLIF(TRIM(SUBSTRING(name, CHAR_LENGTH(SUBSTRING_INDEX(name, ' ', 1)) + 1)), '') WHERE first_name IS NULL;
ALTER TABLE users ADD UNIQUE KEY uq_users_username (username);

ALTER TABLE docs
  ADD COLUMN created_by INT UNSIGNED NULL,
  ADD CONSTRAINT fk_docs_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL;
