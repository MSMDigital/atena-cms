// Registro delle operazioni delicate. Non deve mai far fallire l'operazione che registra.
import { query } from './db.mjs';

export async function audit(userId, action, detail = null) {
  try { await query('INSERT INTO audit_log (user_id, action, detail) VALUES (?, ?, ?)', [userId ?? null, String(action).slice(0, 60), detail == null ? null : String(detail).slice(0, 1000)]); }
  catch (e) { console.error('audit', action, e?.message); }
}

export async function recentAudit(limit = 20) {
  return query('SELECT a.id, a.created_at, a.action, a.detail, u.name AS by_name FROM audit_log a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT ?', [limit]);
}
