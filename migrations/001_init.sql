-- Schema iniziale. Portabile su MySQL 8 e MariaDB: i JSON stanno in LONGTEXT e si leggono/scrivono con JSON.parse/stringify
-- (le colonne JSON native tornano oggetti su MySQL e stringhe su MariaDB). Date in UTC.

CREATE TABLE users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(190) NOT NULL,
  name          VARCHAR(120) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('admin', 'editor') NOT NULL DEFAULT 'editor',
  active        TINYINT(1) NOT NULL DEFAULT 1,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at DATETIME NULL,
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Il cookie contiene il token; qui c'è solo il suo SHA-256, così una copia del database non permette di entrare.
CREATE TABLE sessions (
  id         CHAR(64) NOT NULL PRIMARY KEY,
  user_id    INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  ip         VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  KEY idx_sessions_user (user_id),
  KEY idx_sessions_expires (expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Limite ai tentativi di accesso per email e per indirizzo.
CREATE TABLE login_attempts (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email      VARCHAR(190) NOT NULL,
  ip         VARCHAR(45) NOT NULL,
  success    TINYINT(1) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_attempts_email (email, created_at),
  KEY idx_attempts_ip (ip, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Contenuti: un documento per token, dati del sito, blocchi condivisi e ciascuna pagina.
-- `draft` è quello che si modifica, `published` quello online (NULL finché non è mai stato pubblicato).
CREATE TABLE docs (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  kind             ENUM('tokens', 'site', 'shared', 'page') NOT NULL,
  doc_key          VARCHAR(80) NOT NULL,
  draft            LONGTEXT NOT NULL,
  published        LONGTEXT NULL,
  draft_updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  draft_updated_by INT UNSIGNED NULL,
  published_at     DATETIME NULL,
  published_by     INT UNSIGNED NULL,
  UNIQUE KEY uq_docs (kind, doc_key),
  CONSTRAINT fk_docs_draft_by FOREIGN KEY (draft_updated_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_docs_published_by FOREIGN KEY (published_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cronologia: ogni salvataggio e ogni pubblicazione, per poter tornare indietro.
CREATE TABLE doc_revisions (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  doc_id     INT UNSIGNED NOT NULL,
  data       LONGTEXT NOT NULL,
  action     ENUM('import', 'save', 'publish') NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by INT UNSIGNED NULL,
  KEY idx_revisions_doc (doc_id, created_at),
  CONSTRAINT fk_revisions_doc FOREIGN KEY (doc_id) REFERENCES docs (id) ON DELETE CASCADE,
  CONSTRAINT fk_revisions_user FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Storico delle pubblicazioni (riuscite e fallite).
CREATE TABLE publications (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by INT UNSIGNED NULL,
  status     ENUM('ok', 'failed') NOT NULL,
  pages      INT UNSIGNED NOT NULL DEFAULT 0,
  changed    TEXT NULL,
  log        TEXT NULL,
  KEY idx_publications_created (created_at),
  CONSTRAINT fk_publications_user FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Libreria media (le immagini restano su disco: qui percorso e metadati).
CREATE TABLE media (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  path        VARCHAR(255) NOT NULL,
  mime        VARCHAR(80) NOT NULL,
  width       INT UNSIGNED NULL,
  height      INT UNSIGNED NULL,
  bytes       INT UNSIGNED NOT NULL,
  uploaded_by INT UNSIGNED NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_media_path (path),
  CONSTRAINT fk_media_user FOREIGN KEY (uploaded_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Richieste inviate dai moduli: si salvano sempre, oltre a partire per email.
CREATE TABLE form_submissions (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  block_id   VARCHAR(64) NOT NULL,
  page_key   VARCHAR(80) NOT NULL,
  locale     CHAR(2) NOT NULL,
  data       LONGTEXT NOT NULL,
  consent    TINYINT(1) NOT NULL DEFAULT 0,
  ip_hash    CHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  status     ENUM('new', 'read', 'archived') NOT NULL DEFAULT 'new',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_submissions_status (status, created_at),
  KEY idx_submissions_page (page_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
