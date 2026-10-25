-- Header e footer scorporati: due nuovi tipi di documento (una mappa nome → header, e una nome → footer).
ALTER TABLE docs MODIFY kind ENUM('tokens', 'site', 'shared', 'page', 'headers', 'footers') NOT NULL;
