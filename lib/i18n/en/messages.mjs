import core from './core.mjs';
import nav from './nav.mjs';
import posts from './posts.mjs';
import pages from './pages.mjs';
import media from './media.mjs';
import users from './users.mjs';
import settings from './settings.mjs';
import editor from './editor.mjs';
import install from './install.mjs';
import schema from './schema.mjs';
import templates from './templates.mjs';
import style from './style.mjs';

// Messaggi che le librerie (lib/, render/, schema/) restituiscono all'interfaccia dell'admin: chiave = frase esatta prodotta dal codice,
// con {segnaposto} dove il codice compone la frase con dei valori. Il codice resta in italiano; si traduce al confine con loc()/t().

const base = {
  // ---- utenti (lib/users.mjs) ----
  'Scrivi il nome.': 'Enter the first name.',
  'Immagine non valida.': 'Invalid image.',
  "Scrivi l'indirizzo completo del profilo LinkedIn (https://www.linkedin.com/in/…).": 'Enter the full address of the LinkedIn profile (https://www.linkedin.com/in/…).',
  'Ogni social ha un nome e un indirizzo completo (https://…).': 'Each social profile needs a name and a full address (https://…).',
  'Il nome utente ha da 3 a 40 caratteri: lettere minuscole, numeri, punto, trattino e underscore.': 'The username must be 3 to 40 characters: lowercase letters, numbers, dot, hyphen and underscore.',
  'Email non valida.': 'Invalid email.',
  'Ruolo non valido.': 'Invalid role.',
  'Questo nome utente è già in uso.': 'This username is already in use.',
  'Questa email è già in uso.': 'This email is already in use.',
  "L'utente non esiste.": 'The user does not exist.',
  'Non puoi modificare questo utente.': 'You cannot edit this user.',
  'Non puoi togliere a te stesso il ruolo di amministratore né disattivarti: chiedilo a un altro amministratore.': 'You cannot remove your own Administrator role or deactivate yourself: ask another administrator.',
  'Deve restare almeno un amministratore attivo.': 'At least one active administrator must remain.',
  'Non puoi eliminare il tuo stesso account.': 'You cannot delete your own account.',
  'Nessun utente selezionato.': 'No users selected.',
  'Azione non valida.': 'Invalid action.',
  'Scegli il nuovo ruolo.': 'Choose the new role.',
  '{u}: non puoi farlo su te stesso': '{u}: you cannot do this to yourself',
  '{u}: deve restare almeno un amministratore': '{u}: at least one administrator must remain',

  // ---- password (lib/password-policy.mjs, sessions.mjs, page-access.mjs) ----
  'La password deve avere almeno {n} caratteri.': 'The password must be at least {n} characters long.',
  'La password è troppo lunga (massimo 200 caratteri).': 'The password is too long (200 characters maximum).',
  'Usa almeno tre tipi di caratteri tra minuscole, maiuscole, numeri e simboli.': 'Use at least three types of characters among lowercase, uppercase, numbers and symbols.',
  "La password non deve contenere il nome utente o l'email.": 'The password must not contain the username or the email.',
  'La password è troppo prevedibile.': 'The password is too predictable.',
  'La nuova password deve avere almeno {n} caratteri.': 'The new password must be at least {n} characters long.',
  'La nuova password è troppo lunga (massimo 200 caratteri).': 'The new password is too long (200 characters maximum).',
  'La password attuale non è corretta.': 'The current password is incorrect.',
  'Utente non valido.': 'Invalid user.',
  "La nuova password deve essere diversa dall'attuale e dall'email.": 'The new password must be different from the current one and from the email.',
  'Troppi tentativi. Riprova tra 15 minuti.': 'Too many attempts. Try again in 15 minutes.',
  'Servizio occupato: riprova tra un momento.': 'Service busy: try again in a moment.',
  'Inserisci la tua password per confermare.': 'Enter your password to confirm.',
  'Password non corretta.': 'Incorrect password.',

  // ---- contenuti: pagine, articoli, cestino, pubblicazione (lib/docs.mjs, refs.mjs, content-guard.mjs) ----
  "Un'altra pubblicazione è in corso": 'Another publish is in progress',
  'riprova tra un momento': 'try again in a moment',
  'Mancano i dati del sito o i token': 'The site data or tokens are missing',
  'esegui npm run db:seed': 'run npm run db:seed',
  '{x} (eliminata)': '{x} (deleted)',
  'tokens.json non valido: {m}': 'Invalid tokens.json: {m}',
  'La chiave «new» è riservata.': 'The key “new” is reserved.',
  'La chiave può contenere solo lettere minuscole, numeri e trattini.': 'The key can only contain lowercase letters, numbers and hyphens.',
  'Serve un nome.': 'A name is required.',
  "L'indirizzo può contenere solo lettere minuscole, numeri e trattini.": 'The address can only contain lowercase letters, numbers and hyphens.',
  'La pagina "{k}" è nel cestino: ripristinala o eliminala per sempre.': 'The page "{k}" is in the Trash: restore it or delete it permanently.',
  'Esiste già una pagina con chiave "{k}".': 'A page with the key "{k}" already exists.',
  'La pagina padre non esiste.': 'The parent page does not exist.',
  'Esiste già una pagina con questo indirizzo allo stesso livello.': 'A page with this address already exists at the same level.',
  'Serve un titolo.': 'A title is required.',
  "L'indirizzo può contenere solo lettere minuscole, numeri e trattini (e non può essere «new»).": 'The address can only contain lowercase letters, numbers and hyphens (and cannot be “new”).',
  'L\'articolo "{k}" è nel cestino: ripristinalo o eliminalo per sempre.': 'The post "{k}" is in the Trash: restore it or delete it permanently.',
  'Esiste già un articolo con indirizzo "{k}".': 'A post with the address "{k}" already exists.',
  'La home non si può eliminare.': 'The home page cannot be deleted.',
  "L'articolo non esiste.": 'The post does not exist.',
  'La pagina non esiste.': 'The page does not exist.',
  'La pagina è ancora usata: togli prima i riferimenti.': 'The page is still in use: remove the references first.',
  'Non è nel cestino.': 'It is not in the Trash.',
  'Si elimina per sempre solo dal cestino.': 'Items can only be deleted permanently from the Trash.',
  'link nel testo': 'link in the text',
  'link': 'link',
  'pagina figlia': 'child page',
  "Solo un admin può aggiungere un modulo (i destinatari delle richieste li decide lui).": 'Only an administrator can add a form (they decide who receives the requests).',
  "Solo un admin può cambiare i destinatari e l'oggetto dell'email di un modulo.": "Only an administrator can change a form's recipients and email subject.",
  'Solo un admin può aggiungere un blocco di codice HTML.': 'Only an administrator can add an HTML code block.',
  'Solo un admin può cambiare il codice di un blocco HTML.': 'Only an administrator can change the code of an HTML block.',

  // ---- impostazioni generali, email, indirizzo admin (lib/general.mjs, settings.mjs, mail.mjs, admin-path.mjs) ----
  'Indirizzo email non valido.': 'Invalid email address.',
  'Fuso orario non valido.': 'Invalid time zone.',
  'Formato della data non valido.': 'Invalid date format.',
  "Formato dell'ora non valido.": 'Invalid time format.',
  'Giorno non valido.': 'Invalid day.',
  'Lingua non disponibile.': 'Language not available.',
  'Manca SETTINGS_SECRET nel file .env: non posso cifrare la password.': 'SETTINGS_SECRET is missing from the .env file: the password cannot be encrypted.',
  'Scrivi il dominio da cui inviare, per esempio esempio.ch (senza http:// né @).': 'Enter the domain to send from, for example example.com (without http:// or @).',
  'Indirizzo del mittente non valido.': 'Invalid sender address.',
  'Nome non valido (massimo 100 caratteri, senza < > ").': 'Invalid name (100 characters maximum, without < > ").',
  'La chiave API non sembra valida (la trovi in Brevo → SMTP e API → Chiavi API).': 'The API key does not look valid (you can find it in Brevo → SMTP & API → API keys).',
  'Manca SETTINGS_SECRET nel file .env: senza, la chiave non si può conservare in modo sicuro.': 'SETTINGS_SECRET is missing from the .env file: without it, the key cannot be stored securely.',
  'Incolla la chiave API di Brevo.': 'Paste the Brevo API key.',
  'Indica il server SMTP.': 'Enter the SMTP server.',
  'Solo il nome del server (es. smtp.esempio.ch), senza http:// né percorsi.': 'Only the server name (e.g. smtp.example.com), without http:// or paths.',
  'Scegli il tipo di connessione.': 'Choose the connection type.',
  'Porta non valida (1-65535).': 'Invalid port (1-65535).',
  'Password non valida.': 'Invalid password.',
  'Manca SETTINGS_SECRET nel file .env: senza, la password non si può conservare in modo sicuro (esegui npm run env:init su un .env nuovo o aggiungila a mano).': 'SETTINGS_SECRET is missing from the .env file: without it, the password cannot be stored securely (run npm run env:init on a new .env or add it by hand).',
  'La chiave API di Brevo salvata non si può decifrare (SETTINGS_SECRET è cambiato?): inseriscila di nuovo in Impostazioni email.': 'The saved Brevo API key cannot be decrypted (did SETTINGS_SECRET change?): enter it again in Email settings.',
  'La password SMTP salvata non si può decifrare (SETTINGS_SECRET è cambiato?): inseriscila di nuovo in Impostazioni email.': 'The saved SMTP password cannot be decrypted (did SETTINGS_SECRET change?): enter it again in Email settings.',
  'Al massimo {n} indirizzi.': 'At most {n} addresses.',
  '«{x}» non è un indirizzo email valido.': '“{x}” is not a valid email address.',
  'Brevo non raggiungibile: tempo scaduto': 'Brevo unreachable: timed out',
  'Brevo non raggiungibile: connessione non riuscita': 'Brevo unreachable: connection failed',
  "Brevo ha rifiutato l'invio ({s})": 'Brevo rejected the send ({s})',
  "Brevo ha rifiutato l'invio ({s}): {d}": 'Brevo rejected the send ({s}): {d}',
  "Nessuna email dell'amministrazione.": 'No administration email.',
  'Server email non configurato.': 'Email server not configured.',
  "Server email non configurato: compila Impostazioni email nell'admin.": 'Email server not configured: fill in Email settings in the admin.',
  'Nessun destinatario: indica un indirizzo in Impostazioni → Email.': 'No recipient: enter an address in Settings → Email.',
  'Nessuna impostazione email: salva prima i parametri.': 'No email settings: save the parameters first.',
  'Prova invio email - Atena CMS': 'Email sending test - Atena CMS',
  "Questa è un'email di prova inviata dalle Impostazioni email del CMS.\nSe la leggi, le richieste dei moduli del sito arriveranno con queste stesse impostazioni.\n": 'This is a test email sent from the CMS email settings.\nIf you can read it, requests from the site forms will arrive using these same settings.\n',
  'Da 3 a 40 caratteri: lettere minuscole, cifre e trattini (non all\'inizio né alla fine).': 'From 3 to 40 characters: lowercase letters, digits and hyphens (not at the start or end).',
  'Questo nome è riservato o troppo prevedibile: scegline un altro.': 'This name is reserved or too predictable: choose another one.',
  'Troppo facile da indovinare: aggiungi qualcosa di tuo.': 'Too easy to guess: add something of your own.',
  'Esiste già una pagina del sito con questo indirizzo.': 'A page of the site with this address already exists.',
  'Database non configurato: manca DB_PASSWORD (esegui npm run env:init)': 'Database not configured: DB_PASSWORD is missing (run npm run env:init)',

  // ---- richieste dei moduli (lib/requests.mjs, forms.mjs) ----
  'In invio': 'Sending',
  'Inviata': 'Sent',
  'Non inviata': 'Not sent',
  'Non configurata': 'Not configured',
  'Stato non valido': 'Invalid status',
  'Richiesta non trovata.': 'Request not found.',
  'Il modulo non è più pubblicato: destinatari non disponibili.': 'The form is no longer published: recipients not available.',

  // ---- media (lib/media.mjs) ----
  'Troppi caricamenti in corso: riprova tra un momento.': 'Too many uploads in progress: try again in a moment.',
  "L'immagine è danneggiata o troppo grande.": 'The image is damaged or too large.',
  "Il contenuto del file non corrisponde a un'immagine valida.": 'The file content is not a valid image.',
  "L'immagine non ha dimensioni valide.": 'The image has no valid dimensions.',
  "L'immagine ha troppi pixel (massimo 50 megapixel).": 'The image has too many pixels (50 megapixels maximum).',
  "Non è stato possibile elaborare l'immagine.": 'The image could not be processed.',
  'Il file è vuoto.': 'The file is empty.',
  'Il file supera {n} MB.': 'The file exceeds {n} MB.',
  'Formato non supportato: usa JPG, PNG, WebP o SVG.': 'Unsupported format: use JPG, PNG, WebP or SVG.',
  'Spazio per le immagini esaurito ({n} MB): elimina quelle che non servono.': 'Image storage is full ({n} MB): delete the ones you do not need.',
  'Spazio per le immagini esaurito.': 'Image storage is full.',
  "SVG non ammesso: contiene elementi non consentiti (script, gestori di eventi o riferimenti a risorse esterne). Esportalo di nuovo dall'editor grafico, senza script né link esterni.": 'SVG not allowed: it contains forbidden elements (scripts, event handlers or references to external resources). Export it again from your graphics editor, without scripts or external links.',
  'SVG non ammesso: contiene elementi non consentiti (script, gestori di eventi o riferimenti a risorse esterne).': 'SVG not allowed: it contains forbidden elements (scripts, event handlers or references to external resources).',
  'Troppe elaborazioni in corso: riprova tra un momento.': 'Too many operations in progress: try again in a moment.',
  "L'immagine non esiste.": 'The image does not exist.',
  'Le immagini del progetto non si sostituiscono da qui.': 'Project images cannot be replaced from here.',
  'Un SVG si sostituisce con un altro SVG.': 'An SVG can only be replaced with another SVG.',
  'Questa immagine si sostituisce con un JPG, PNG o WebP (non con un SVG).': 'This image can be replaced with a JPG, PNG or WebP (not with an SVG).',
  'Gli SVG non si possono ritagliare né ridimensionare.': 'SVGs cannot be cropped or resized.',
  'Modo non valido.': 'Invalid mode.',
  'Le immagini del progetto non si modificano sul posto: salva una copia.': 'Project images cannot be edited in place: save a copy.',
  'Niente da modificare: scegli un ritaglio o una larghezza.': 'Nothing to change: choose a crop or a width.',
  'Il file non si trova più sul server.': 'The file can no longer be found on the server.',
  'Il ritaglio non è valido.': 'The crop is not valid.',
  "Il ritaglio esce dall'immagine ({w} × {h} px).": 'The crop goes outside the image ({w} × {h} px).',
  'Il ritaglio è troppo piccolo (minimo 16 px per lato).': 'The crop is too small (minimum 16 px per side).',
  'La larghezza deve essere tra 16 e {n} px.': 'The width must be between 16 and {n} px.',
  'Si può solo ridurre: la larghezza massima è {n} px.': 'You can only reduce it: the maximum width is {n} px.',
  '{n} (modificata)': '{n} (edited)',
  'Le immagini del progetto non si rinominano da qui.': 'Project images cannot be renamed from here.',
  'Scrivi un nome (lettere o numeri).': 'Enter a name (letters or numbers).',
  'Il nome è già questo.': 'The name is already this one.',
  'Esiste già un file chiamato «{n}»: scegli un altro nome.': 'A file named “{n}” already exists: choose another name.',
  'Una pubblicazione è in corso: riprova tra un momento.': 'A publish is in progress: try again in a moment.',
  'Le immagini del progetto non si eliminano da qui.': 'Project images cannot be deleted from here.',
  "L'immagine è ancora usata.": 'The image is still in use.',

  // ---- anteprima (lib/preview.mjs) ----
  "Database vuoto: installa i contenuti di esempio del template o completa l'installazione": 'The database is empty: install the template sample content or complete the installation',
  'Anteprima non disponibile: {m}': 'Preview not available: {m}',
  'Anteprima non disponibile con questi dati: {m}': 'Preview not available with this data: {m}',
  'Nessuna pagina da mostrare.': 'No page to show.',

  // ---- backup e ripristino (lib/backup.mjs) ----
  'database.jsonl non valido': 'Invalid database.jsonl',
  'Un altro backup o ripristino è in corso: riprova tra un momento.': 'Another backup or restore is in progress: try again in a moment.',
  'Il pacchetto contiene un percorso non ammesso: {n}': 'The package contains a path that is not allowed: {n}',
  'Il pacchetto contiene un file che non è un backup di Atena: {n}': 'The package contains a file that is not part of an Atena backup: {n}',
  'Il pacchetto contiene troppi file.': 'The package contains too many files.',
  'Il pacchetto, una volta aperto, supera il limite consentito (BACKUP_MAX_MB).': 'The package, once unpacked, exceeds the allowed limit (BACKUP_MAX_MB).',
  'File troppo grande nel pacchetto.': 'A file in the package is too large.',
  "Non è un pacchetto di backup di Atena (manca il manifest all'inizio).": 'This is not an Atena backup package (the manifest is missing at the start).',
  'Il pacchetto non è un backup di Atena, o viene da una versione di formato diversa.': 'The package is not an Atena backup, or comes from a different format version.',
  'Il backup viene da una versione più recente di Atena (migrazioni sconosciute: {m}): aggiorna prima il CMS.': 'The backup comes from a newer version of Atena (unknown migrations: {m}): update the CMS first.',
  'Nel pacchetto manca il database.': 'The database is missing from the package.',
  "Il database nel pacchetto è danneggiato (l'impronta non corrisponde): il file è stato caricato per intero?": 'The database in the package is damaged (the checksum does not match): was the file uploaded completely?',
  'Ripristino del database non riuscito: {m}.': 'Database restore failed: {m}.',
  'Ripristino del database non riuscito: {m}. Il backup di sicurezza è {s}.': 'Database restore failed: {m}. The safety backup is {s}.',
  'Nome del file non valido: usa lettere, numeri, trattini e punti, con estensione .zip.': 'Invalid file name: use letters, numbers, hyphens and dots, with a .zip extension.',
  'Il file supera il limite consentito ({n} MB, BACKUP_MAX_MB).': 'The file exceeds the allowed limit ({n} MB, BACKUP_MAX_MB).',

  // ---- template (lib/template*.mjs, cli) ----
  "Un'altra operazione sui template è in corso: riprova tra un momento.": 'Another template operation is in progress: try again in a moment.',
  'Template non utilizzabile: {m}': 'Template unusable: {m}',
  'I contenuti attuali non sono compatibili con questo template.': 'The current content is not compatible with this template.',
  'Attivazione non riuscita: {m}.': 'Activation failed: {m}.',
  'Attivazione non riuscita: {m}. I contenuti precedenti sono stati ripristinati.': 'Activation failed: {m}. The previous content has been restored.',
  'Attivazione non riuscita: {m}. Il ripristino automatico non è riuscito: la copia è in {b}.': 'Activation failed: {m}. The automatic restore failed: the copy is in {b}.',
  'Nessun template attivo: installa o attiva un template (Admin → Template, oppure la procedura di installazione).': 'No active template: install or activate a template (Admin → Templates, or the installation procedure).',
  'Template non valido': 'Invalid template',
  'Template non valido.': 'Invalid template.',
  'Template non valido: {m}': 'Invalid template: {m}',
  'Template non trovato.': 'Template not found.',
  'Il template non è valido.': 'The template is not valid.',
  'Il template attivo non si può togliere: attiva prima un altro template.': 'The active template cannot be removed: activate another template first.',
  'Il template "{i}" è già installato (versione {a}): la versione del pacchetto ({b}) deve essere più recente.': 'The template "{i}" is already installed (version {a}): the package version ({b}) must be newer.',
  'Contenuti di esempio non validi: {m}': 'Invalid sample content: {m}',
  'Il template non ha pagine di esempio da mostrare.': 'The template has no sample pages to show.',
  'Non è un file zip.': 'This is not a zip file.',
  'Troppi file (oltre {n}).': 'Too many files (more than {n}).',
  '{n}: file troppo grande': '{n}: file too large',
  'Contenuto decompresso troppo grande.': 'The unpacked content is too large.',
  '{n}: rapporto di compressione sospetto.': '{n}: suspicious compression ratio.',
  'Lo zip non è leggibile o è danneggiato.': 'The zip cannot be read or is damaged.',
  '{n}: percorso non ammesso': '{n}: path not allowed',
  '{n}: questo tipo di file non può stare qui': '{n}: this type of file is not allowed here',
  '{n}: presente due volte': '{n}: present twice',
  'Il pacchetto contiene file non ammessi.': 'The package contains files that are not allowed.',
  '{n}: importa "{s}" fuori dalla cartella render/': '{n}: imports "{s}" from outside the render/ folder',
  '{n}: importa "{s}" (ammessi solo @cms/kit e i file di render/)': '{n}: imports "{s}" (only @cms/kit and the files in render/ are allowed)',
  '{n}: import() con un percorso calcolato': '{n}: import() with a computed path',
  '{n}: usa eval o new Function': '{n}: uses eval or new Function',
  '{n}: usa process o require': '{n}: uses process or require',
  '{w}: annidamento eccessivo': '{w}: nesting too deep',
  '{k}: file mancante': '{k}: file missing',
  '{k}: JSON non valido ({m})': '{k}: invalid JSON ({m})',
  'manca il file {f}': 'missing file {f}',
  'manca la cartella assets/': 'missing assets/ folder',
  'content/pages/ deve contenere almeno una pagina (home.json)': 'content/pages/ must contain at least one page (home.json)',
  'schema/site.json: "{k}" è un campo del motore e non si può ridefinire': 'schema/site.json: "{k}" is an engine field and cannot be redefined',
  'schema/page.json: "{k}" è un campo del motore e non si può ridefinire': 'schema/page.json: "{k}" is an engine field and cannot be redefined',
  '{f}: troppo grande (oltre 2 MB)': '{f}: too large (over 2 MB)',
  '{f}: troppo grande (oltre 1 MB)': '{f}: too large (over 1 MB)',
  'i contenuti di esempio superano 20 MB': 'the sample content exceeds 20 MB',
  'schema/blocks.json deve contenere { "blocks": [ ... ] } con almeno un blocco': 'schema/blocks.json must contain { "blocks": [ ... ] } with at least one block',
  'schema/blocks.json: ogni blocco ha un "$id" del tipo .../blocks/<tipo>.json (trovato {x})': 'schema/blocks.json: every block needs an "$id" like .../blocks/<type>.json (found {x})',
  'schema/blocks.json: il blocco "{a}" deve avere properties.type.const = "{b}"': 'schema/blocks.json: the block "{a}" must have properties.type.const = "{b}"',
  'schema/blocks.json: "{k}" è un tipo di blocco del motore e non si può ridefinire': 'schema/blocks.json: "{k}" is an engine block type and cannot be redefined',
  'gli schemi non sono validi: {m}': 'the schemas are not valid: {m}',
  'contenuti di esempio: manca la pagina "home"': 'sample content: the "home" page is missing',
  'contenuti di esempio non leggibili: {m}': 'sample content cannot be read: {m}',
  'pagina "{k}" ({l}): l\'HTML non comincia con <!doctype html>': 'page "{k}" ({l}): the HTML does not start with <!doctype html>',
  'pagina "{k}": uno script in linea usa cookie o localStorage (va coperto dall\'informativa cookie)': 'page "{k}": an inline script uses cookies or localStorage (it must be covered by the cookie notice)',
  'prova di esecuzione: {m}': 'test run: {m}',

  // ---- render e pubblicazione (render/*.mjs) ----
  'Token non validi': 'Invalid tokens',
  'Contenuti non validi': 'Invalid content',
  'Immagini mancanti': 'Missing images',
  'file non trovato: {m}': 'file not found: {m}',
  'Indirizzo non valido': 'Invalid address',
  'la pagina "{k}" finirebbe fuori dalla cartella del sito': 'the page "{k}" would end up outside the site folder',
  'renderPage non ha restituito una stringa per "{k}"': 'renderPage did not return a string for "{k}"',
  "L'HTML prodotto è troppo grande.": 'The generated HTML is too large.',
  'operazione sconosciuta: {o}': 'unknown operation: {o}',
  'canale sconosciuto: {c}': 'unknown channel: {c}',
  'CMS_RENDER_WRAPPER non è un array JSON di stringhe.': 'CMS_RENDER_WRAPPER is not a JSON array of strings.',
  'Errore del template': 'Template error',
  'Il processo che esegue il template si è fermato ({s})': 'The process running the template stopped ({s})',
  'Il processo che esegue il template si è fermato ({s}): {t}': 'The process running the template stopped ({s}): {t}',
  'Il processo che esegue il template non è partito: {m}': 'The process running the template did not start: {m}',
  'Il template ha impiegato troppo tempo: interrotto.': 'The template took too long: stopped.',
  'Invio al processo isolato non riuscito: {m}': 'Sending to the isolated process failed: {m}',
  'font: già in locale, invariati': 'fonts: already local, unchanged',
  'font: {n} file scaricati': 'fonts: {n} files downloaded',
  'nessun font trovato per i sottoinsiemi richiesti': 'no font found for the requested subsets',
  'font: download fallito ({m}) e nessun fonts.css esistente': 'fonts: download failed ({m}) and no existing fonts.css',
  'font: ATTENZIONE, download fallito ({m}), tengo quelli esistenti (possono non corrispondere ai token)': 'fonts: WARNING, download failed ({m}), keeping the existing ones (they may not match the tokens)',
};

// ---- controlli SEO / GEO di articoli e pagine (lib/post-seo.mjs) ----
const seo = {
  'Manca il titolo': 'The title is missing',
  'Manca il titolo SEO': 'The SEO title is missing',
  'Manca la descrizione SEO (o il riassunto)': 'The SEO description (or the summary) is missing',
  'Manca la descrizione SEO': 'The SEO description is missing',
  "Immagine di condivisione presente": 'Sharing image present',
  "Manca l'immagine di condivisione (anteprima nei social)": 'The sharing image is missing (social preview)',
  'Contenuto cortissimo: {n} parole': 'Very short content: {n} words',
  'Contenuto breve: {n} parole (meglio da 300)': 'Short content: {n} words (better from 300)',
  'Contenuto breve: {n} parole (meglio da 150)': 'Short content: {n} words (better from 150)',
  'Contenuto: {n} parole': 'Content: {n} words',
  'La parola chiave «{k}» è nel titolo': 'The keyword “{k}” is in the title',
  'La parola chiave «{k}» non compare nel titolo': 'The keyword “{k}” does not appear in the title',
  'La parola chiave «{k}» è nella descrizione': 'The keyword “{k}” is in the description',
  'La parola chiave «{k}» non compare nella descrizione': 'The keyword “{k}” does not appear in the description',
  "La parola chiave «{k}» è nell'indirizzo": 'The keyword “{k}” is in the address',
  "La parola chiave «{k}» non compare nell'indirizzo ({s})": 'The keyword “{k}” does not appear in the address ({s})',
  "La parola chiave «{k}» non compare nell'indirizzo, che è vuoto": 'The keyword “{k}” does not appear in the address, which is empty',
  'Nessuna parola chiave principale: non si può controllare la coerenza con titolo e descrizione': 'No main keyword: consistency with the title and description cannot be checked',
  'Titolo e descrizione sono identici: la descrizione dovrebbe aggiungere informazioni': 'The title and description are identical: the description should add information',
  'Indirizzo lungo ({n} caratteri): meglio sotto i 75': 'Long address ({n} characters): better under 75',
  "L'articolo è escluso dai motori di ricerca (noindex)": 'The post is excluded from search engines (noindex)',
  'La pagina è esclusa dai motori di ricerca (noindex)': 'The page is excluded from search engines (noindex)',
  'La pagina è protetta da password: i motori di ricerca non ne vedono il contenuto': 'The page is password-protected: search engines cannot see its content',
  'Autore: {a}': 'Author: {a}',
  "Manca l'autore": 'The author is missing',
  "Manca l'autore (pagina di tipo articolo)": 'The author is missing (article-type page)',
  "Manca il riassunto che un'AI può citare": 'The summary that an AI can cite is missing',
  "Manca il riassunto (o la descrizione) che un'AI può citare": 'The summary (or description) that an AI can cite is missing',
  'Argomento chiaro (categoria o tag)': 'Clear topic (category or tag)',
  "Nessuna categoria o tag: l'argomento non è chiaro": 'No category or tag: the topic is not clear',
  "Abbastanza testo per un'AI ({n} parole)": 'Enough text for an AI ({n} words)',
  "Poco testo da cui un'AI possa attingere: {n} parole (meglio da 300)": 'Little text for an AI to draw from: {n} words (better from 300)',
  'Data di ultima modifica indicata': 'Last modified date provided',
  'Manca la data di ultima modifica sostanziale': 'The date of the last substantial change is missing',
  'Fatti chiave o domande frequenti presenti': 'Key facts or FAQs present',
  'Nessun fatto chiave né domanda frequente (aiutano le AI a citare)': 'No key facts or FAQs (they help AIs cite the content)',
  "L'articolo è escluso dai motori di intelligenza artificiale": 'The post is excluded from artificial intelligence engines',
  'La pagina è esclusa dai motori di intelligenza artificiale': 'The page is excluded from artificial intelligence engines',
};
for (const [it, en] of [['Titolo SEO', 'SEO title'], ['Descrizione SEO', 'SEO description']]) {
  seo[`${it}: {n} caratteri (meglio tra {lo} e {hi})`] = `${en}: {n} characters (better between {lo} and {hi})`;
  seo[`${it}: {n} caratteri (ideale {lo}–{hi})`] = `${en}: {n} characters (ideal {lo}–{hi})`;
}
seo['Riassunto per le AI: {n} caratteri (meglio tra {lo} e {hi})'] = 'Summary for AIs: {n} characters (better between {lo} and {hi})';
seo['Riassunto per le AI: {n} caratteri (ideale {lo}–{hi})'] = 'Summary for AIs: {n} characters (ideal {lo}–{hi})';

// ---- problemi di validazione (schema/validate.mjs): messaggio nudo e con prefisso «documento.json/percorso: » ----
const issues = {
  'Campo obbligatorio': 'Required field',
  'Non può essere vuoto': 'Cannot be empty',
  'Servono almeno {n} caratteri': 'At least {n} characters required',
  'Al massimo {n} caratteri': 'At most {n} characters allowed',
  'Contiene formattazione non ammessa': 'Contains formatting that is not allowed',
  'Formato non valido': 'Invalid format',
  'Valore non ammesso': 'Value not allowed',
  'Tipo di valore non valido': 'Invalid value type',
  'Servono almeno {n} elementi': 'At least {n} items required',
  'Al massimo {n} elementi': 'At most {n} items allowed',
  'Campo non previsto': 'Unexpected field',
  'Valore non valido ({m})': 'Invalid value ({m})',
  'Elementi duplicati': 'Duplicate items',
  'Manca il codice della lingua «{l}» (per esempio {e})': 'The code for the language “{l}” is missing (for example {e})',
  'Il link punta alla pagina "{g}", che non esiste ancora': 'The link points to the page "{g}", which does not exist yet',
  'Il link punta a "{g}", che è in bozza e non sarà online': 'The link points to "{g}", which is a draft and will not be online',
  "Il link punta a {g}#{a} ma la pagina non ha quell'ancora": 'The link points to {g}#{a} but the page does not have that anchor',
  'Segnaposto ancora da risolvere: {s}': 'Placeholder still to be resolved: {s}',
  "Indica quando pubblicare l'articolo pianificato": 'Enter when to publish the scheduled post',
  'La categoria "{c}" non esiste': 'The category "{c}" does not exist',
  'Il tag "{c}" non esiste': 'The tag "{c}" does not exist',
  'L\'id "{a}" deve coincidere con la chiave "{b}"': 'The id "{a}" must match the key "{b}"',
  'Manca la pagina "home"': 'The "home" page is missing',
  'Il header "{x}" non esiste': 'The header "{x}" does not exist',
  'Il footer "{x}" non esiste': 'The footer "{x}" does not exist',
  'La pagina padre "{x}" non esiste': 'The parent page "{x}" does not exist',
  'La catena delle pagine padre forma un ciclo': 'The chain of parent pages forms a loop',
  'Id blocco duplicato "{a}" (già in {b})': 'Duplicate block id "{a}" (already in {b})',
  'Il blocco condiviso "{x}" non esiste': 'The shared block "{x}" does not exist',
  'Lo stesso indirizzo {a} è già usato da "{b}"': 'The same address {a} is already used by "{b}"',
};
const withIssues = {};
for (const [it, en] of Object.entries(issues)) {
  withIssues[it] = en;
  withIssues[`{doc}: ${it}`] = `{doc}: ${en}`;
  withIssues[`contenuti di esempio: {doc}: ${it}`] = `sample content: {doc}: ${en}`;
}

// ---- token dello stile (render/tokens.mjs): messaggio nudo, con «tokens.json: » davanti ----
const tokens = {
  'colors.{k}: colore non valido': 'colors.{k}: invalid color',
  'surfaces.{s}.{k}: colore non valido': 'surfaces.{s}.{k}: invalid color',
  'typography.scale.{k}: serve size [mobile, desktop] in px, max opzionale >= size': 'typography.scale.{k}: needs size [mobile, desktop] in px, optional max >= size',
  'typography.scale.{k}.weight: intero tra 100 e 900': 'typography.scale.{k}.weight: integer between 100 and 900',
  'typography.scale.{k}.lineHeight: tra 0.5 e 3': 'typography.scale.{k}.lineHeight: between 0.5 and 3',
  'typography.scale.{k}.tracking: numero seguito da em (es. -0.02em)': 'typography.scale.{k}.tracking: a number followed by em (e.g. -0.02em)',
  'typography.display.{k}: serve size [mobile, desktop] in px, max opzionale >= size': 'typography.display.{k}: needs size [mobile, desktop] in px, optional max >= size',
  'typography.fonts.body: nome di font non valido (solo lettere, numeri e spazi)': 'typography.fonts.body: invalid font name (only letters, numbers and spaces)',
  'typography.fonts.heading: nome di font non valido (solo lettere, numeri e spazi)': 'typography.fonts.heading: invalid font name (only letters, numbers and spaces)',
  'typography.fonts.fallback: elenco di font non valido': 'typography.fonts.fallback: invalid font list',
  'typography.fonts.subsets: elenco non vuoto tra {l}': 'typography.fonts.subsets: non-empty list from {l}',
  'typography.fonts.extraWeights: interi tra 100 e 900': 'typography.fonts.extraWeights: integers between 100 and 900',
  'typography.fluid: from deve essere < to': 'typography.fluid: from must be < to',
  'buttons.effect: ammessi {l}': 'buttons.effect: allowed values are {l}',
  'buttons.radius: una misura come 999px, 12px o 0px': 'buttons.radius: a measure like 999px, 12px or 0px',
  'buttons.minHeight: tra 24 e 120': 'buttons.minHeight: between 24 and 120',
  'buttons.weight: intero tra 100 e 900': 'buttons.weight: integer between 100 and 900',
  'layout.maxWidth: tra 600 e 3000': 'layout.maxWidth: between 600 and 3000',
  'layout.gutter: espressione CSS non valida': 'layout.gutter: invalid CSS expression',
  'layout.section: espressione CSS non valida': 'layout.section: invalid CSS expression',
  'layout.headerHeight: tra 40 e 200': 'layout.headerHeight: between 40 and 200',
};
const withTokens = {};
for (const [it, en] of Object.entries(tokens)) { withTokens[it] = en; withTokens[`tokens.json: ${it}`] = `tokens.json: ${en}`; }

// ---- template.json (lib/template.mjs): messaggio con «template.json: » e con i prefissi di chi lo rilancia ----
const manifest = {
  'template.json: deve essere un oggetto': 'template.json: must be an object',
  'template.json: "id" deve essere minuscolo, con lettere, numeri e trattini (es. "starter")': 'template.json: "id" must be lowercase, with letters, numbers and hyphens (e.g. "starter")',
  'template.json: serve "name"': 'template.json: "name" is required',
  'template.json: "version" deve essere del tipo 1.0.0': 'template.json: "version" must look like 1.0.0',
  'template.json: "engine" deve essere {a} (formato dei pacchetti di questo CMS); il template dichiara {b}': 'template.json: "engine" must be {a} (the package format of this CMS); the template declares {b}',
  'template.json: "{k}" non valido': 'template.json: "{k}" is not valid',
};
const withManifest = {};
for (const [it, en] of Object.entries(manifest)) {
  withManifest[it] = en;
  withManifest[`Template non utilizzabile: ${it}`] = `Template unusable: ${en}`;
  withManifest[`Template non valido: ${it}`] = `Invalid template: ${en}`;
}

// ---- pattern degli schemi dei template (lib/template-install.mjs: riskyPattern) ----
const risky = {
  'non è una stringa': 'is not a string',
  'troppo lungo (oltre 600 caratteri)': 'too long (over 600 characters)',
  'retroreferenze non ammesse': 'backreferences not allowed',
  'lookbehind non ammesso': 'lookbehind not allowed',
  'quantificatori annidati o alternative ripetute (rischio di blocco del server)': 'nested quantifiers or repeated alternations (risk of blocking the server)',
  'non valido: {m}': 'invalid: {m}',
};
const withRisky = {};
for (const [it, en] of Object.entries(risky)) {
  withRisky[`{w}: pattern ${it}`] = `{w}: pattern ${en}`;
  withRisky[`{w}: patternProperties ${it}`] = `{w}: patternProperties ${en}`;
}

// ---- etichette del motore che arrivano al t() attraverso variabili (lib/schema-form.mjs) ----
const labels = {
  'Chiara': 'Light', 'Scura': 'Dark', 'Brand': 'Brand', 'Bozza': 'Draft', 'Pubblicata': 'Published', 'Pianificata': 'Scheduled',
  'Italiano': 'Italian', 'Inglese': 'English', 'Tedesco': 'German', 'Francese': 'French',
  'Pagina del sito': 'Site page', 'Indirizzo esterno': 'External address', 'Ancora nella pagina': 'Anchor in the page', 'Contatto': 'Contact channel',
  'Integrata (clic su "Mostra la mappa")': 'Built-in (click on “Show the map”)', 'iubenda': 'iubenda',
  'Testo': 'Text', 'Email': 'Email', 'Telefono': 'Phone', 'Data': 'Date', 'Scelta': 'Choice', 'Testo lungo': 'Long text', 'Consenso': 'Consent',
  'Metà riga': 'Half row', 'Riga intera': 'Full row', 'Primario': 'Primary', 'Secondario': 'Secondary', 'Inverso': 'Inverse',
  'WhatsApp': 'WhatsApp', 'Mobile': 'Mobile', 'Consenti': 'Allow', 'Blocca': 'Block', 'Aperto': 'Open', 'Chiuso (nessun crawler)': 'Closed (no crawlers)',
  'Chi siamo': 'About us', 'Contatti': 'Contact', 'Servizio': 'Service', 'Articolo': 'Post', 'Elenco / raccolta': 'List / collection', 'Sito (pagina generica)': 'Website (generic page)',
  'Chiave': 'Key', 'Stato': 'Status', 'Pagina padre': 'Parent page', 'Indirizzo': 'Address', 'Lingua predefinita': 'Default language', 'Lingue online': 'Online languages',
  'Codici lingua': 'Language codes', 'Nome del sito': 'Site name', 'Icona (file)': 'Icon (file)', 'Mappa: testo del consenso': 'Map: consent text',
  'Mappa: pulsante "Mostra"': 'Map: “Show” button', 'Mappa: pulsante delle preferenze': 'Map: preferences button', 'Mappa: link "Apri in Google Maps"': 'Map: “Open in Google Maps” link',
  'Link "Preferenze cookie" nel footer': '“Cookie preferences” link in the footer', 'Nome': 'Name',
  'Navigazione': 'Navigation', 'Menu, intestazione e piè di pagina del sito.': 'Site menu, header and footer.',
  'SEO & Geo': 'SEO & Geo', 'Come il sito si presenta ai motori di ricerca e alle intelligenze artificiali: anteprime, dati strutturati, organizzazione, robots.txt, llms.txt.': 'How the site presents itself to search engines and artificial intelligence: previews, structured data, organization, robots.txt, llms.txt.',
  'Lingue': 'Languages', 'Si gestiscono da Impostazioni → Lingue.': 'Managed in Settings → Languages.',
  'Si gestisce da Impostazioni → Email.': 'Managed in Settings → Email.',
  'Dati del sito': 'Site data', 'Dati usati da tutto il sito: azienda, lingue, consenso, analytics, testi fissi. Le modifiche valgono in tutte le pagine.': 'Data used across the whole site: company, languages, consent, analytics, fixed texts. Changes apply to all pages.',
};

const mine = { ...base, ...seo, ...withIssues, ...withTokens, ...withManifest, ...withRisky, ...labels
};

// Le frasi che un'altra area del dizionario traduce già restano a quella (una sola traduzione per frase).
const others = [core, nav, posts, pages, media, users, settings, editor, install, schema, templates, style];
export default Object.fromEntries(Object.entries(mine).filter(([k]) => !others.some((d) => Object.hasOwn(d, k))));
