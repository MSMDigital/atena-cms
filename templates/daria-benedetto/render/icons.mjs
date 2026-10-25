// Icone in linea (SVG inline, nessun file esterno). Tutte 24×24, disegnate con il colore del testo.
import { raw } from '@cms/kit';

const svg = (inner, fill = false) => raw(`<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false" ${fill ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"'}>${inner}</svg>`);

export const arrow = () => svg('<path d="M5 12h14M13 6l6 6-6 6"/>');
export const check = () => svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>');

// Reti: nome → icona. Quelle non elencate ricadono su un cerchio con l'iniziale (gestito da chi chiama).
const NETWORKS = {
  linkedin: svg('<path d="M6.94 8.5H3.56V20h3.38V8.5zM5.25 3.2a1.97 1.97 0 100 3.94 1.97 1.97 0 000-3.94zM20.44 13.4c0-3.1-1.65-4.55-3.85-4.55a3.32 3.32 0 00-2.99 1.65h-.04V8.5h-3.24V20h3.38v-6.1c0-1.6.3-3.15 2.29-3.15 1.96 0 1.98 1.83 1.98 3.25V20h3.38v-6.6z"/>', true),
  instagram: svg('<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r=".6" fill="currentColor"/>'),
  tiktok: svg('<path d="M14 3v11.2a3.3 3.3 0 11-3.3-3.3M14 3c.3 2.4 1.9 4.1 4.5 4.3"/>'),
  youtube: svg('<rect x="2.8" y="5.5" width="18.4" height="13" rx="4"/><path d="M10.2 9.4l4.6 2.6-4.6 2.6z" fill="currentColor"/>'),
  amazon: svg('<path d="M4 16.5c4.8 3.2 11.2 3.2 16 0M17.5 14.5l2.5 2-.7 3"/><path d="M8 11.5V9.8c0-2.2 1.8-3.3 4-3.3s3.7 1 3.7 3v5.4M8 12.4c0 1.4 1 2.1 2.2 2.1 1.9 0 2.9-1.2 2.9-3"/>'),
  google: svg('<path d="M20.5 12.2c0-.6-.1-1.1-.2-1.6H12v3h4.8a4.1 4.1 0 01-1.8 2.7v2.2h2.9c1.7-1.6 2.6-3.9 2.6-6.3z" fill="currentColor" stroke="none"/><path d="M12 21c2.4 0 4.5-.8 5.9-2.2L15 16.6c-.8.5-1.8.9-3 .9-2.3 0-4.3-1.6-5-3.7H4v2.3A9 9 0 0012 21z" fill="currentColor" stroke="none"/><path d="M7 13.8a5.4 5.4 0 010-3.6V7.9H4a9 9 0 000 8.2z" fill="currentColor" stroke="none"/><path d="M12 6.6c1.3 0 2.5.5 3.4 1.3l2.6-2.5A9 9 0 004 7.9l3 2.3c.7-2.100 2.700-3.600 5-3.600z" fill="currentColor" stroke="none"/>'),
  facebook: svg('<path d="M14 8.5V7c0-.8.4-1.2 1.3-1.2H17V3h-2.6C11.800 3 10.500 4.500 10.500 6.800v1.700H8V11.500h2.500V21H14v-9.500h2.600L17 8.500z" fill="currentColor" stroke="none"/>'),
  star: svg('<path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/>'),
  email: svg('<rect x="3" y="5.5" width="18" height="13" rx="3"/><path d="M4 8l8 5.500L20 8"/>'),
};
export const network = (name) => NETWORKS[name] ?? '';

// Icone dei riquadri (menu a tendina, prenotazioni, punti): nome → contenuto SVG 24×24. L'elenco dei nomi è anche nello schema (campo "icon").
const GLYPHS = {
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8"/>',
  sparkle: '<path d="M12 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7z"/><path d="M19 16.5v4M17 18.5h4"/>',
  chip: '<rect x="6" y="6" width="12" height="12" rx="2.5"/><path d="M9.5 9.5h5v5h-5z"/><path d="M9 2.5V6M15 2.5V6M9 18v3.5M15 18v3.5M2.5 9H6M2.5 15H6M18 9h3.5M18 15h3.5"/>',
  graduation: '<path d="M2.5 9 12 4.5 21.5 9 12 13.5z"/><path d="M6.5 11v4.5c0 1.5 2.5 3 5.5 3s5.5-1.5 5.5-3V11"/><path d="M21.5 9v5"/>',
  people: '<circle cx="8" cy="8.5" r="3"/><circle cx="16.5" cy="9.5" r="2.5"/><path d="M2.5 19c.5-3.2 2.7-5 5.5-5s5 1.8 5.5 5"/><path d="M14 14.6c.8-.4 1.6-.6 2.5-.6 2.4 0 4.2 1.6 4.8 4.5"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5 13.5 13.5 8.5 15.5 10.5 10.5z"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4.5h11l-2 3.5 2 3.5H5"/>',
  swap: '<path d="M4 8h13M13 4l4 4-4 4"/><path d="M20 16H7M11 12l-4 4 4 4"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7"/><path d="M3 12.5h18"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M9 14.5l2 2 4-4"/>',
  video: '<rect x="2.5" y="6" width="13" height="12" rx="2.5"/><path d="M15.5 10.5l6-3.5v10l-6-3.5"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>',
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.5 1.5M17.2 17.2l1.5 1.5M5.3 18.7l1.5-1.5M17.2 6.8l1.5-1.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  gift: '<rect x="3.5" y="8.5" width="17" height="12" rx="2"/><path d="M12 8.5v12M3.5 12.5h17M12 8.5c-1.5-3.5-5.5-4-5.5-1.5 0 1.5 3 1.5 5.5 1.5zM12 8.5c1.5-3.5 5.5-4 5.5-1.5 0 1.5-3 1.5-5.5 1.5z"/>',
  heart: '<path d="M12 21s-7.5-4.6-7.5-10.3A4.3 4.3 0 0 1 12 8a4.3 4.3 0 0 1 7.5 2.7C19.5 16.4 12 21 12 21z"/>',
};
export const icon = (name, size = 22, stroke = 1.7) => (GLYPHS[name]
  ? raw(`<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[name]}</svg>`)
  : '');
export const chevron = () => raw('<svg class="nav-dd__chev" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>');
export const external = () => raw('<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7M9 7h8v8"/></svg>');
