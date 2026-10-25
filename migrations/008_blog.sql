-- Blog: articoli e categorie sono due nuovi tipi di documento.
ALTER TABLE docs MODIFY kind ENUM('tokens', 'site', 'shared', 'page', 'headers', 'footers', 'post', 'categories') NOT NULL;
