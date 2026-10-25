// Articoli pianificati: una volta all'ora (allo scoccare dell'ora) il server controlla se qualcuno è arrivato all'ora di uscita e, in quel caso,
// rifà il sito (lib/docs.mjs → publishDue); controlla anche poco dopo l'avvio. Dove l'admin non resta acceso, la stessa cosa si fa da cron,
// una volta all'ora: 0 * * * * npm run publish:due
// Il codice che usa Node (database, sharp) sta in instrumentation-node.js: questo file viene compilato anche per l'ambiente edge, che non lo regge.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startScheduler } = await import('./instrumentation-node');
    startScheduler();
  }
}
