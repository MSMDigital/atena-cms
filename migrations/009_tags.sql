-- Tag del blog: un elenco di tag (nome e descrizione), come le categorie.
ALTER TABLE docs MODIFY kind ENUM('tokens', 'site', 'shared', 'page', 'headers', 'footers', 'post', 'categories', 'tags') NOT NULL;
