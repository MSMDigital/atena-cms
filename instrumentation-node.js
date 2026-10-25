// Parte solo-Node dell'instrumentation (vedi instrumentation.js): controllo orario degli articoli pianificati.
import { publishDue } from './lib/docs.mjs';

export function startScheduler() {
  if (globalThis.__atenaDueTimer) return;
  const HOUR = 3_600_000;
  let busy = false;
  const run = async () => {
    if (busy) return;
    busy = true;
    try { await publishDue(); } catch (e) { console.error('[pianificazione]', e.message); } finally { busy = false; }
  };
  const toNextHour = () => HOUR - (Date.now() % HOUR) + 10_000;
  const tick = () => { run(); globalThis.__atenaDueTimer = setTimeout(tick, toNextHour()); globalThis.__atenaDueTimer.unref?.(); };
  globalThis.__atenaDueTimer = setTimeout(tick, toNextHour());
  globalThis.__atenaDueTimer.unref?.();
  setTimeout(run, 30_000).unref?.();
}
