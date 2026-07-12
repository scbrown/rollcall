/**
 * Append-only message log: used for debugging and, via the unique Twilio SID,
 * for inbound idempotency (carriers retry webhook deliveries).
 */

import { db } from "../db/index.js";

/**
 * Record an inbound message keyed by its Twilio MessageSid. Returns false if
 * this SID was already logged (a retry) so the caller can skip re-processing.
 */
export function recordInbound(sid: string, phone: string, body: string): boolean {
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO message_log (direction, phone, body, twilio_sid)
       VALUES ('in', ?, ?, ?)`,
    )
    .run(phone, body, sid);
  return result.changes > 0;
}

export function recordOutbound(phone: string, body: string, sid?: string): void {
  db.prepare(
    `INSERT INTO message_log (direction, phone, body, twilio_sid)
     VALUES ('out', ?, ?, ?)`,
  ).run(phone, body, sid ?? null);
}

export interface LogRow {
  id: number;
  direction: string;
  phone: string;
  body: string;
  twilio_sid: string | null;
  created_at: string;
}

/** Most recent log rows, newest first, for the admin debug view. */
export function recentLog(limit = 100): LogRow[] {
  return db
    .prepare("SELECT * FROM message_log ORDER BY id DESC LIMIT ?")
    .all(limit) as LogRow[];
}

/** Prune log rows older than `days`. Returns the number deleted. */
export function pruneLog(days: number): number {
  const result = db
    .prepare(`DELETE FROM message_log WHERE created_at < datetime('now', ?)`)
    .run(`-${days} days`);
  return result.changes;
}
