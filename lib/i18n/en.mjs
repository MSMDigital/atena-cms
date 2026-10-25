// Dizionario italiano → inglese dell'interfaccia dell'admin: si compone dai file di lib/i18n/en/ (uno per area).
import core from './en/core.mjs';
import nav from './en/nav.mjs';
import posts from './en/posts.mjs';
import pages from './en/pages.mjs';
import media from './en/media.mjs';
import users from './en/users.mjs';
import settings from './en/settings.mjs';
import editor from './en/editor.mjs';
import install from './en/install.mjs';
import messages from './en/messages.mjs';
import schema from './en/schema.mjs';
import templates from './en/templates.mjs';
import style from './en/style.mjs';

export const EN = { ...core, ...nav, ...posts, ...pages, ...media, ...users, ...settings, ...editor, ...install, ...messages, ...schema, ...templates, ...style };
