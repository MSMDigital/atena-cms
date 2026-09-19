-- Richieste dei moduli: stato dell'invio email (la richiesta è salvata comunque) e indice per il limite per indirizzo.
ALTER TABLE form_submissions
  ADD COLUMN mail_status ENUM('pending', 'sent', 'failed', 'skipped') NOT NULL DEFAULT 'pending',
  ADD COLUMN mail_error VARCHAR(500) NULL,
  ADD COLUMN mailed_at DATETIME NULL,
  ADD COLUMN recipients VARCHAR(500) NULL,
  ADD KEY idx_submissions_ip (ip_hash, created_at),
  ADD KEY idx_submissions_block (block_id, created_at);
