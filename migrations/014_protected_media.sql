-- Immagini e PDF «protetti»: non si raggiungono da un indirizzo diretto e non si indicizzano; si vedono solo da dentro il sito
-- (pagine che li usano, link interni). Il file si serve dall'app (/api/files/...), non dai file statici del sito.
ALTER TABLE media ADD COLUMN protected TINYINT(1) NOT NULL DEFAULT 0;
