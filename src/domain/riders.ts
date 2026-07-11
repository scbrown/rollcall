/**
 * Rider + crew reads and the small mutations the SMS grammar needs
 * (rename, mute/unmute, opt-out/in, welcome + footer bookkeeping).
 */

import { randomUUID } from "node:crypto";
import { db, nowSql } from "../db/index.js";
import type { Crew, Rider } from "./types.js";

export function findRiderByPhone(phone: string): Rider | undefined {
  return db.prepare("SELECT * FROM riders WHERE phone = ?").get(phone) as Rider | undefined;
}

export function getRider(id: string): Rider | undefined {
  return db.prepare("SELECT * FROM riders WHERE id = ?").get(id) as Rider | undefined;
}

export function getCrew(id: string): Crew | undefined {
  return db.prepare("SELECT * FROM crews WHERE id = ?").get(id) as Crew | undefined;
}

/**
 * Everyone in the rider's crew except the rider themselves, excluding riders
 * who have muted or carrier-opted-out. This is the fan-out audience.
 */
export function crewFanoutTargets(rider: Rider): Rider[] {
  if (!rider.crew_id) return [];
  return db
    .prepare(
      `SELECT * FROM riders
       WHERE crew_id = ? AND id != ? AND muted = 0 AND opted_out = 0
       ORDER BY display_name`,
    )
    .all(rider.crew_id, rider.id) as Rider[];
}

/** All riders in a crew (used for `who`, which ignores mute — mute is fan-out only). */
export function crewMembers(crewId: string): Rider[] {
  return db
    .prepare("SELECT * FROM riders WHERE crew_id = ? ORDER BY display_name")
    .all(crewId) as Rider[];
}

/** Case-insensitive display-name lookup within a crew, for `where <name>`. */
export function findCrewRiderByName(crewId: string, name: string): Rider | undefined {
  return db
    .prepare("SELECT * FROM riders WHERE crew_id = ? AND lower(display_name) = lower(?)")
    .get(crewId, name.trim()) as Rider | undefined;
}

export function setDisplayName(riderId: string, name: string): void {
  db.prepare("UPDATE riders SET display_name = ? WHERE id = ?").run(name, riderId);
}

export function setMuted(riderId: string, muted: boolean): void {
  db.prepare("UPDATE riders SET muted = ? WHERE id = ?").run(muted ? 1 : 0, riderId);
}

export function setOptedOut(riderId: string, optedOut: boolean): void {
  db.prepare("UPDATE riders SET opted_out = ? WHERE id = ?").run(optedOut ? 1 : 0, riderId);
}

export function markWelcomed(riderId: string): void {
  db.prepare("UPDATE riders SET welcomed_at = ? WHERE id = ?").run(nowSql(), riderId);
}

export function markFooterShown(riderId: string): void {
  db.prepare("UPDATE riders SET footer_shown_at = ? WHERE id = ?").run(nowSql(), riderId);
}

/** Admin/seed helper: create a crew if it doesn't already exist, return its id. */
export function upsertCrew(name: string, id = randomUUID()): string {
  const existing = db.prepare("SELECT id FROM crews WHERE name = ?").get(name) as
    | { id: string }
    | undefined;
  if (existing) return existing.id;
  db.prepare("INSERT INTO crews (id, name) VALUES (?, ?)").run(id, name);
  return id;
}

/** Admin/seed helper: create or update a rider by phone. */
export function upsertRider(phone: string, displayName: string, crewId: string): Rider {
  const existing = findRiderByPhone(phone);
  if (existing) {
    db.prepare("UPDATE riders SET display_name = ?, crew_id = ? WHERE id = ?").run(
      displayName,
      crewId,
      existing.id,
    );
    return getRider(existing.id)!;
  }
  const id = randomUUID();
  db.prepare(
    "INSERT INTO riders (id, phone, display_name, crew_id) VALUES (?, ?, ?, ?)",
  ).run(id, phone, displayName, crewId);
  return getRider(id)!;
}
