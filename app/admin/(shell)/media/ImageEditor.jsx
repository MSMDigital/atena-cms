'use client';

// Ritaglio e ridimensionamento di un'immagine: si trascina il rettangolo (o i suoi bordi) sull'anteprima, oppure si scrivono i valori precisi;
// si può bloccare la proporzione. Le coordinate sono in pixel dell'immagine vera (l'anteprima è solo una guida).
import { useRef, useState } from 'react';
import { useT } from '@/app/admin/_i18n/I18nProvider';

const MIN = 16;
const RATIOS = [['free', 'Libero'], ['orig', 'Come l\'originale'], ['1:1', '1:1'], ['4:3', '4:3'], ['3:2', '3:2'], ['16:9', '16:9'], ['9:16', '9:16']];
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export default function ImageEditor({ item, src, canReplace, onApply, busy }) {
  const t = useT();
  const W = item.width; const H = item.height;
  const box = useRef(null);
  const drag = useRef(null);
  const [rect, setRect] = useState({ x: 0, y: 0, w: W, h: H });
  const [ratio, setRatio] = useState('free');
  const [twInput, setTwInput] = useState(null);   // null = segue la larghezza del ritaglio finché non la si scrive a mano

  const ratioValue = (key = ratio) => (key === 'free' ? null : key === 'orig' ? W / H : (([a, b]) => a / b)(key.split(':').map(Number)));
  const toNat = (e) => { const r = box.current.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }; };

  const resize = (start, handle, p, r) => {
    let { x, y, w, h } = start;
    let x2 = x + w; let y2 = y + h;
    if (handle.includes('w')) x = clamp(p.x, 0, x2 - MIN);
    if (handle.includes('e')) x2 = clamp(p.x, x + MIN, W);
    if (handle.includes('n')) y = clamp(p.y, 0, y2 - MIN);
    if (handle.includes('s')) y2 = clamp(p.y, y + MIN, H);
    w = x2 - x; h = y2 - y;
    if (r) {
      const byWidth = handle.includes('e') || handle.includes('w');
      const availW = handle.includes('w') ? start.x + start.w : W - start.x;
      const availH = handle.includes('n') ? start.y + start.h : H - start.y;
      if (byWidth) { w = Math.min(w, availW, availH * r); h = w / r; } else { h = Math.min(h, availH, availW / r); w = h * r; }
      x = handle.includes('w') ? start.x + start.w - w : start.x;
      y = handle.includes('n') ? start.y + start.h - h : start.y;
    }
    return { x, y, w, h };
  };

  const down = (e, mode) => { e.preventDefault(); e.stopPropagation(); box.current.setPointerCapture(e.pointerId); drag.current = { mode, start: rect, p: toNat(e) }; };
  const move = (e) => {
    const d = drag.current; if (!d) return;
    const p = toNat(e);
    if (d.mode === 'move') setRect({ ...d.start, x: clamp(d.start.x + p.x - d.p.x, 0, W - d.start.w), y: clamp(d.start.y + p.y - d.p.y, 0, H - d.start.h) });
    else setRect(resize(d.start, d.mode, p, ratioValue()));
  };
  const up = () => { drag.current = null; };

  const pickRatio = (key) => {
    setRatio(key);
    const r = ratioValue(key);
    if (!r) return;
    const w = Math.min(W, H * r); const h = w / r;
    setRect({ x: (W - w) / 2, y: (H - h) / 2, w, h });
  };
  const num = (k, v) => {
    const n = Math.round(Number(v)); if (!Number.isFinite(n)) return;
    const r = { ...rect };
    if (k === 'x') r.x = clamp(n, 0, W - r.w); else if (k === 'y') r.y = clamp(n, 0, H - r.h);
    else if (k === 'w') { r.w = clamp(n, MIN, W - r.x); if (ratioValue()) r.h = Math.min(r.w / ratioValue(), H - r.y); }
    else { r.h = clamp(n, MIN, H - r.y); if (ratioValue()) r.w = Math.min(r.h * ratioValue(), W - r.x); }
    setRect(r);
  };

  // Si arrotondano i bordi (non le misure): così il rettangolo resta dentro l'immagine anche con coordinate decimali.
  const rx = Math.round(rect.x); const ry = Math.round(rect.y);
  const R = { x: rx, y: ry, w: Math.min(Math.round(rect.x + rect.w), W) - rx, h: Math.min(Math.round(rect.y + rect.h), H) - ry };
  const whole = R.x === 0 && R.y === 0 && R.w === W && R.h === H;
  const tw = twInput ?? String(R.w);
  const target = Math.round(Number(tw));
  const scaling = Number.isFinite(target) && target >= MIN && target < R.w;
  const finalW = scaling ? target : R.w;
  const finalH = Math.round(R.h * (finalW / R.w));
  const tooBig = Number.isFinite(target) && target > R.w;
  const nothing = whole && !scaling;
  const params = { crop: whole ? null : { x: R.x, y: R.y, width: R.w, height: R.h }, width: scaling ? target : null };   // i nomi sono quelli che il server si aspetta

  return (
    <div className="ied">
      <p className="muted ied__hint">{t('Trascina il rettangolo per ritagliare; trascina i bordi per cambiare la misura.')}</p>
      <div className="ied__stage" ref={box} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={t('Immagine da modificare')} draggable={false} />
        <div className="ied__rect" style={{ left: `${(rect.x / W) * 100}%`, top: `${(rect.y / H) * 100}%`, width: `${(rect.w / W) * 100}%`, height: `${(rect.h / H) * 100}%` }} onPointerDown={(e) => down(e, 'move')}>
          {HANDLES.map((h) => <span key={h} className={`ied__h ied__h--${h}`} onPointerDown={(e) => down(e, h)} />)}
        </div>
      </div>
      <div className="ied__row">
        <label>{t('Proporzione')}
          <select value={ratio} onChange={(e) => pickRatio(e.target.value)}>{RATIOS.map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}</select>
        </label>
        <button type="button" className="link" onClick={() => { setRect({ x: 0, y: 0, w: W, h: H }); setRatio('free'); setTwInput(null); }}>{t('Ripristina')}</button>
      </div>
      <details className="ied__num">
        <summary>{t('Valori precisi (pixel)')}</summary>
        <div className="ied__grid">
          {[['x', 'Da sinistra', R.x], ['y', 'Dall\'alto', R.y], ['w', 'Larghezza', R.w], ['h', 'Altezza', R.h]].map(([k, l, v]) => (
            <label key={k}>{t(l)}<input type="number" value={v} min={0} onChange={(e) => num(k, e.target.value)} /></label>
          ))}
        </div>
      </details>
      <div className="ied__row">
        <label>{t('Larghezza finale (px)')}
          <input type="number" value={tw} min={MIN} max={R.w} onChange={(e) => setTwInput(e.target.value)} aria-invalid={tooBig} />
        </label>
        <span className="muted">{t('Risultato: {w} × {h} px', { w: finalW, h: finalH })}{!whole ? ` (${t('ritaglio {w} × {h}', { w: R.w, h: R.h })})` : ''}</span>
      </div>
      {(R.w < MIN || R.h < MIN) && <p className="bad">{t('Il ritaglio è troppo piccolo: minimo {min} px per lato.', { min: MIN })}</p>}
      {tooBig && <p className="bad">{t('Si può solo ridurre: la larghezza massima è {w} px.', { w: R.w })}</p>}
      <div className="ied__actions">
        <button type="button" className="btn btn--primary" disabled={busy || nothing || tooBig || R.w < MIN || R.h < MIN} onClick={() => onApply(params, 'copy')}>{t('Salva come nuova immagine')}</button>
        <button type="button" className="btn" disabled={busy || nothing || tooBig || !canReplace} title={canReplace ? t('Cambia questa immagine: vale ovunque sia usata') : t('Le immagini del progetto non si modificano sul posto')} onClick={() => onApply(params, 'replace')}>{t('Applica a questa immagine')}</button>
      </div>
      <p className="muted ied__hint">{t('«Applica a questa immagine» cambia il file: tutte le pagine che la usano mostreranno la nuova versione. «Nuova immagine» lascia l\'originale com\'è.')}</p>
    </div>
  );
}
