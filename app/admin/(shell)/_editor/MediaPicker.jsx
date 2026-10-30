'use client';

import { useMemo, useState } from 'react';
import Uploader from '../media/Uploader';
import { useT } from '@/app/admin/_i18n/I18nProvider';

// Finestra per scegliere un'immagine della libreria o caricarne una nuova (che viene scelta subito).
export default function MediaPicker({ media, current, maxMb, onPick, onUploaded, onClose, only = 'image' }) {
  const t = useT();
  const [q, setQ] = useState('');
  const shown = useMemo(() => media.filter((i) => (only === 'pdf' ? i.kind === 'pdf' : i.kind !== 'pdf')).filter((i) => !q || `${i.path} ${i.name} ${i.alt}`.toLowerCase().includes(q.toLowerCase())), [media, q, only]);

  const open = (d) => { if (d && !d.open) d.showModal(); };   // niente evento «close»: vedi Modal in media/MediaLibrary.jsx

  return (
    <dialog ref={open} className="picker" aria-label={only === 'pdf' ? t('Scegli un PDF') : t('Scegli un\'immagine')} onCancel={(e) => { e.preventDefault(); onClose(); }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="picker__box">
        <div className="picker__head">
          <h2>{only === 'pdf' ? t('Scegli un PDF') : t('Scegli un\'immagine')}</h2>
          <button type="button" className="mini" onClick={onClose}>{t('Chiudi')}</button>
        </div>
        <Uploader compact multiple={false} only={only === 'pdf' ? 'pdf' : null} maxMb={maxMb} onItem={(item) => { onUploaded(item); onPick(item); }} />
        <input type="search" className="picker__q" placeholder={t('Cerca per nome o testo alternativo')} aria-label={t('Cerca immagini')} value={q} onChange={(e) => setQ(e.target.value)} />
        {shown.length === 0 && <p className="muted">{only === 'pdf' ? t('Nessun PDF trovato.') : t('Nessuna immagine trovata.')}</p>}
        <ul className="mgrid picker__grid">
          {shown.map((i) => (
            <li key={i.path}>
              <button type="button" className={`mcell${i.path === current ? ' mcell--sel' : ''}`} disabled={i.missing} onClick={() => onPick(i)} data-path={i.path} title={i.missing ? t('Il file non si trova più sul server') : i.path}>
                {i.missing ? <span className="mcell__missing">{t('File mancante')}</span> : i.kind === 'pdf' ? <span className="mcell__pdf" aria-hidden="true">PDF</span> : /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/admin/media/thumb/${i.path}?v=${i.mtime ?? 0}`} alt="" loading="lazy" />}
                <span className="mcell__name">{i.name}</span>
                {i.source === 'upload' && <span className="tag">{t('Caricata')}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </dialog>
  );
}
