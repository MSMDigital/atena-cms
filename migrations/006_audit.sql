-- Registro delle operazioni delicate (installazione e attivazione di template, impostazioni, utenti...): chi, cosa, quando.
CREATE TABLE audit_log (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_id    INT UNSIGNED NULL,
  action     VARCHAR(60) NOT NULL,
  detail     VARCHAR(1000) NULL,
  KEY idx_audit_created (created_at),
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
