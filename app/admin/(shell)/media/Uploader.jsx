'use client';

import { useRef, useState } from 'react';
import { uploadMany, ACCEPT } from './upload';
import { useT } from '@/app/admin/_i18n/I18nProvider';

// Pulsante e area di trascinamento. onItem riceve ogni immagine caricata.
export default function Uploader({ onItem, maxMb, multiple = true, compact = false }) {
  const t = useT();
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [errors, setErrors] = useState([]);

  async function go(fileList) {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;
    setBusy(true); setErrors([]);
    const errs = await uploadMany(multiple ? files : files.slice(0, 1), onItem, t);
    setErrors(errs); setBusy(false);
    if (input.current) input.current.value = '';
  }

  return (
    <div
      className={`upl${over ? ' upl--over' : ''}${compact ? ' upl--compact' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); go(e.dataTransfer.files); }}
    >
      <input ref={input} type="file" accept={ACCEPT} multiple={multiple} hidden data-testid="upload-input" onChange={(e) => go(e.target.files)} />
      <button type="button" className="btn btn--primary" disabled={busy} onClick={() => input.current?.click()}>{busy ? t('Caricamento…') : multiple ? t('Carica immagini') : t('Carica un\'immagine')}</button>
      {!compact && <span className="muted">{t('oppure trascina qui i file. JPG, PNG o WebP, fino a {maxMb} MB: vengono ridimensionate (massimo 2400 px) e convertite in WebP. SVG (loghi, icone): conservato così com\'è, senza script né link esterni.', { maxMb })}</span>}
      {errors.length > 0 && <ul className="upl__errors" role="alert">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
    </div>
  );
}
