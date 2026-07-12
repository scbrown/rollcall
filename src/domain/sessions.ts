/**
 * RideSession lifecycle — the only interesting state in the system.
 *
 * A session is *live* iff `ended_at IS NULL AND now() < expires_at`. Starting a
 * ride while one is already live updates it in place (refreshes expiry, replaces
 * location) rather than stacking duplicates, per the spec.
 */

import { randomUUID } from "node:crypto";
import { db, hoursFromNowSql, nowSql } from "../db/index.js";
import { config } from "../config.js";
import type { Rider, RideSession } from "./types.js";

/** The rider's currently-live session, if any. */
export function liveSessionFor(riderId: string): RideSession | undefined {
  return db
    .prepare(
      `SELECT * FROM ride_sessions
       WHERE rider_id = ? AND ended_at IS NULL AND expires_at > ?
       ORDER BY started_at DESC LIMIT 1`,
    )
    .get(riderId, nowSql()) as RideSession | undefined;
}

/** All live sessions in a crew, newest first, joined for convenience. */
export interface LiveSessionWithRider extends RideSession {
  display_name: string;
  phone: string;
}

export function liveSessionsInCrew(crewId: string): LiveSessionWithRider[] {
  return db
    .prepare(
      `SELECT s.*, r.display_name, r.phone
       FROM ride_sessions s
       JOIN riders r ON r.id = s.rider_id
       WHERE r.crew_id = ? AND s.ended_at IS NULL AND s.expires_at > ?
       ORDER BY s.started_at DESC`,
    )
    .all(crewId, nowSql()) as LiveSessionWithRider[];
}

/** All live sessions across every crew, for the admin live view. */
export function allLiveSessions(): LiveSessionWithRider[] {
  return db
    .prepare(
      `SELECT s.*, r.display_name, r.phone
       FROM ride_sessions s
       JOIN riders r ON r.id = s.rider_id
       WHERE s.ended_at IS NULL AND s.expires_at > ?
       ORDER BY s.started_at DESC`,
    )
    .all(nowSql()) as LiveSessionWithRider[];
}

/** End a specific session by id (admin action). Returns true if it was live. */
export function endSessionById(sessionId: string): boolean {
  const result = db
    .prepare(
      "UPDATE ride_sessions SET ended_at = ? WHERE id = ? AND ended_at IS NULL",
    )
    .run(nowSql(), sessionId);
  return result.changes > 0;
}

/**
 * Start (or refresh) a ride for a rider. Returns the live session. If one is
 * already live it is updated in place; otherwise a new row is created.
 */
export function startOrRefreshRide(
  rider: Rider,
  locationText: string | null,
): RideSession {
  const now = nowSql();
  const expires = hoursFromNowSql(config.defaultExpiryHours);
  const existing = liveSessionFor(rider.id);

  if (existing) {
    db.prepare(
      "UPDATE ride_sessions SET expires_at = ?, location_text = ? WHERE id = ?",
    ).run(expires, locationText, existing.id);
    return db.prepare("SELECT * FROM ride_sessions WHERE id = ?").get(existing.id) as RideSession;
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO ride_sessions (id, rider_id, started_at, expires_at, location_text)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, rider.id, now, expires, locationText);
  return db.prepare("SELECT * FROM ride_sessions WHERE id = ?").get(id) as RideSession;
}

/** End the rider's live session, if any. Returns true if something was ended. */
export function endRide(riderId: string): boolean {
  const existing = liveSessionFor(riderId);
  if (!existing) return false;
  db.prepare("UPDATE ride_sessions SET ended_at = ? WHERE id = ?").run(nowSql(), existing.id);
  return true;
}

/**
 * Push the rider's live session expiry out by `hours`. Returns the new session
 * or undefined if nothing was live.
 */
export function extendRide(riderId: string, hours: number): RideSession | undefined {
  const existing = liveSessionFor(riderId);
  if (!existing) return undefined;
  const newExpiry = hoursFromNowSql(hours);
  db.prepare("UPDATE ride_sessions SET expires_at = ? WHERE id = ?").run(newExpiry, existing.id);
  return db.prepare("SELECT * FROM ride_sessions WHERE id = ?").get(existing.id) as RideSession;
}

/**
 * Sweep: mark any session whose expiry has passed as ended. Silent by design —
 * no fan-out on expiry. Returns the number of sessions swept.
 */
export function sweepExpired(): number {
  const now = nowSql();
  const result = db
    .prepare(
      "UPDATE ride_sessions SET ended_at = ? WHERE ended_at IS NULL AND expires_at <= ?",
    )
    .run(now, now);
  return result.changes;
}
