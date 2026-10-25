// Esegue l'HTML del template. Un template è codice caricato da uno zip: non deve poter toccare il server. Perciò di norma gira in un processo
// figlio con il modello di permessi di Node (render/child.mjs): niente scritture, niente letture fuori dalla propria cartella, niente processi
// figli né worker, ambiente vuoto. I dati del sito arrivano solo via messaggi; le dimensioni delle immagini le calcola il motore (il figlio
// non legge file). Il processo resta acceso tra una richiesta e l'altra (l'anteprima chiede una pagina a ogni battuta) e riparte se il template cambia.
// Limite noto: Node 22 non restringe la rete; il figlio non riceve segreti, ma potrebbe aprire connessioni con i dati (pubblici) del sito.
// CMS_RENDER=inline esegue tutto nel processo principale (senza isolamento): solo per prove e sviluppo dei template.
import { fork, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from '../lib/env.mjs';
import { ensureKit } from '../lib/template-kit.mjs';

export class RenderError extends Error {}

// Il modello di permessi di Node NON limita i segnali: un template potrebbe mandare SIGUSR1 al processo principale (Next), che aprirebbe
// il debugger su 127.0.0.1:9229 senza autenticazione (= esecuzione di codice con i suoi segreti). Un gestore JavaScript per SIGUSR1
// disattiva quell'apertura. Con SIGTERM/SIGKILL il template può ancora fermare il server (il supervisore lo riavvia): vedi docs/architettura.md.
if (process.listenerCount('SIGUSR1') === 0) process.on('SIGUSR1', () => {});

// Difesa a livello di sistema operativo (facoltativa): CMS_RENDER_WRAPPER = array JSON con il comando che avvolge il processo isolato,
// per esempio ["unshare","-Urn"] (senza rete, utente e rete separati su Linux) o un comando bwrap/nsjail. Il modello di permessi di Node
// da solo non blocca rete e segnali.
function wrapperCommand() {
  const raw = process.env.CMS_RENDER_WRAPPER;
  if (!raw) return null;
  try { const a = JSON.parse(raw); if (Array.isArray(a) && a.length && a.every((x) => typeof x === 'string')) return a; } catch { /* non valido */ }
  throw new RenderError('CMS_RENDER_WRAPPER non è un array JSON di stringhe.');
}
// Da Node 23.5 il flag si chiama --permission; prima --experimental-permission.
const permissionFlag = () => (process.allowedNodeEnvironmentFlags.has('--permission') ? '--permission' : '--experimental-permission');

const CHILD = path.join(ROOT, 'render/child.mjs');
const real = (p) => fs.realpathSync(p);
export const renderMode = () => (process.env.CMS_RENDER === 'inline' ? 'inline' : 'sandbox');

// Più recente modifica nei file del template che contano per l'HTML: se cambia, il processo isolato riparte.
function stampOf(tpl) {
  let latest = 0;
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else latest = Math.max(latest, fs.statSync(f).mtimeMs); } };
  walk(path.join(tpl.dir, 'render'));
  return `${tpl.manifest.version}:${latest}`;
}

// Su globalThis: con la ricarica a caldo di Next in sviluppo questo modulo si rivaluta, e una mappa nuova lascerebbe accesi i processi isolati precedenti.
const workers = (globalThis.__atenaWorkers ??= new Map());   // dir del template → { proc, stamp, pending, ready }

function start(tpl) {
  const kitDir = ensureKit(tpl.dir);   // il @cms/kit sta accanto al template (templates/ oppure template-library/)
  const flags = [
    permissionFlag(),
    `--allow-fs-read=${real(path.join(ROOT, 'render'))}`,
    `--allow-fs-read=${real(tpl.dir)}`,
    `--allow-fs-read=${real(kitDir)}`,
    '--max-old-space-size=512',
  ];
  const opts = { env: {}, cwd: path.join(ROOT, 'render'), serialization: 'json', stdio: ['ignore', 'ignore', 'pipe', 'ipc'] };
  const wrap = wrapperCommand();
  const proc = wrap ? spawn(wrap[0], [...wrap.slice(1), process.execPath, ...flags, CHILD], opts) : fork(CHILD, [], { ...opts, execArgv: flags });
  const w = { proc, stamp: stampOf(tpl), pending: new Map(), seq: 0, stderr: '', dead: false };
  // Il processo isolato non deve tenere vivo quello principale (gli script da riga di comando devono poter finire): lo si "tiene" solo durante una richiesta.
  proc.unref(); proc.stderr?.unref?.();   // il canale resta "tenuto" finché il processo non è pronto
  w.ready = new Promise((resolve, reject) => { w.onReady = resolve; w.onFail = reject; });
  proc.stderr.on('data', (d) => { w.stderr = (w.stderr + d).slice(-4000); });
  proc.on('message', (m) => {
    if (m?.ready) { w.onReady(); if (!w.pending.size) proc.channel?.unref(); return; }
    const p = w.pending.get(m?.id); if (!p) return;
    w.pending.delete(m.id); clearTimeout(p.timer); if (!w.pending.size) w.proc.channel?.unref();
    m.ok ? p.resolve(m) : p.reject(new RenderError(m.error?.message ?? 'Errore del template'));
  });
  const die = (why) => {
    w.dead = true;
    w.onFail(new RenderError(why));
    for (const p of w.pending.values()) { clearTimeout(p.timer); p.reject(new RenderError(why)); }
    w.pending.clear();
    if (workers.get(tpl.dir) === w) workers.delete(tpl.dir);
  };
  proc.on('exit', (code, sig) => die(`Il processo che esegue il template si è fermato (${sig ?? code})${w.stderr ? `: ${w.stderr.trim().split('\n').slice(-3).join(' ')}` : ''}`));
  proc.on('error', (e) => die(`Il processo che esegue il template non è partito: ${e.message}`));
  return w;
}

function call(w, msg, timeoutMs) {
  return new Promise((resolve, reject) => {
    const id = ++w.seq;
    const timer = setTimeout(() => { w.pending.delete(id); reject(new RenderError('Il template ha impiegato troppo tempo: interrotto.')); w.proc.kill('SIGKILL'); }, timeoutMs);
    w.pending.set(id, { resolve, reject, timer });
    w.proc.channel?.ref();
    w.proc.send({ id, ...msg }, (err) => { if (err) { clearTimeout(timer); w.pending.delete(id); reject(new RenderError(`Invio al processo isolato non riuscito: ${err.message}`)); } });
  });
}

async function workerFor(tpl) {
  const stamp = stampOf(tpl);
  let w = workers.get(tpl.dir);
  if (w && (w.stamp !== stamp || w.dead)) { w.proc.kill('SIGKILL'); workers.delete(tpl.dir); w = null; }
  if (!w) {
    w = start(tpl); workers.set(tpl.dir, w);
    // Chi arriva mentre il processo si prepara aspetta la stessa preparazione (prima si poteva ricevere un processo non ancora pronto).
    w.init = w.ready.then(() => call(w, { op: 'init', entry: real(tpl.renderEntry) }, 30_000));
  }
  try { await w.init; } catch (e) { w.proc.kill('SIGKILL'); if (workers.get(tpl.dir) === w) workers.delete(tpl.dir); throw e; }
  return w;
}

// Ferma il processo di un template (per esempio quello di prova, dopo un'installazione: non deve restare acceso).
export function stopWorker(dir) {
  const w = workers.get(dir);
  if (w) { w.proc.kill('SIGKILL'); workers.delete(dir); }
}

let importSeq = 0;
// jobs: [{ locale, keys: [chiavi delle pagine] }] → [{ locale, key, html }]
export async function renderPages(tpl, { data, jobs, images }, { timeoutMs = 120_000 } = {}) {
  if (renderMode() === 'inline') {
    ensureKit(tpl.dir);
    const { createContext } = await import('./context.mjs');
    const mod = await import(`${pathToFileURL(tpl.renderEntry).href}?v=${stampOf(tpl)}`);   // il ?v ricarica il modulo se il template cambia
    const out = [];
    for (const job of jobs) {
      const ctx = createContext(data, job.locale, { images: images ?? {} });
      for (const key of job.keys) out.push({ locale: job.locale, key, html: mod.default.renderPage(ctx, ctx.pageOf(key)) });
    }
    return out;
  }
  const w = await workerFor(tpl);
  const slim = { site: data.site, shared: data.shared, headers: data.headers, footers: data.footers, blog: data.blog, tokens: data.tokens, meta: data.meta ?? null, pages: data.pages, translations: data.translations ?? [] };
  return (await call(w, { op: 'render', data: slim, jobs, images }, timeoutMs)).out;
}

export function stopRenderers() {
  for (const w of workers.values()) w.proc.kill('SIGKILL');
  workers.clear();
}
process.on('exit', stopRenderers);
