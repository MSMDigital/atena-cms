'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Uploader from '../media/Uploader';

// Finestra per scegliere un'immagine della libreria o caricarne una nuova (che viene scelta subito).
export default function MediaPicker({ media, current, maxMb, onPick, onUploaded, onClose }) {
  const dialog = useRef(null);
  const [q, setQ] = useState('');
  const shown = useMemo(() => media.filter((i) => !q || `${i.path} ${i.name} ${i.alt}`.toLowerCase().includes(q.toLowerCase())), [media, q]);

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    return () => { if (d?.open) d.close(); };
  }, []);

  return (
    <dialog ref={dialog} className="picker" aria-label="Scegli un'immagine" onClose={onClose} onCancel={onClose} onClick={(e) => { if (e.target === dialog.current) onClose(); }}>
      <div className="picker__box">
        <div className="picker__head">
          <h2>Scegli un&apos;immagine</h2>
          <button type="button" className="mini" onClick={onClose}>Chiudi</button>
        </div>
        <Uploader compact multiple={false} maxMb={maxMb} onItem={(item) => { onUploaded(item); onPick(item); }} />
        <input type="search" className="picker__q" placeholder="Cerca per nome o testo alternativo" aria-label="Cerca immagini" value={q} onChange={(e) => setQ(e.target.value)} />
        {shown.length === 0 && <p className="muted">Nessuna immagine trovata.</p>}
        <ul className="mgrid picker__grid">
          {shown.map((i) => (
            <li key={i.path}>
              <button type="button" className={`mcell${i.path === current ? ' mcell--sel' : ''}`} disabled={i.missing} onClick={() => onPick(i)} data-path={i.path} title={i.missing ? 'Il file non si trova più sul server' : i.path}>
                {i.missing ? <span className="mcell__missing">File mancante</span> : /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/admin/media/thumb/${i.path}`} alt="" loading="lazy" />}
                <span className="mcell__name">{i.name}</span>
                {i.source === 'upload' && <span className="tag">Caricata</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </dialog>
  );
}
