-- Impostazioni modificabili dall'admin (per ora: invio email). Le password si conservano cifrate (vedi lib/settings.mjs).
CREATE TABLE settings (
  name       VARCHAR(64) NOT NULL PRIMARY KEY,
  value      LONGTEXT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by INT UNSIGNED NULL,
  CONSTRAINT fk_settings_user FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
