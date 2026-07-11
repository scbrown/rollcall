/**
 * Outbound message copy. Kept in one place so wording stays consistent and
 * fan-out messages stay under 160 GSM-7 chars (one segment) where it matters.
 */

import type { LiveSessionWithRider } from "../domain/sessions.js";
import type { RideSession } from "../domain/types.js";

/** "9:15pm" from an ISO/SQL timestamp, in the server's local time. */
export function shortTime(sqlTimestamp: string): string {
  // SQL timestamps are UTC ("YYYY-MM-DD HH:MM:SS"); make them parseable as UTC.
  const date = new Date(sqlTimestamp.replace(" ", "T") + "Z");
  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const meridiem = hours >= 12 ? "pm" : "am";
  hours = hours % 12 || 12;
  return `${hours}:${minutes}${meridiem}`;
}

const FOOTER = "Reply WHO to see everyone out, MUTE to silence.";

/**
 * The fan-out message a crew receives when someone goes live. `withFooter`
 * appends the compliance/help footer (first-ever fan-out, then <=1×/30d).
 */
export function fanoutMessage(
  riderName: string,
  session: RideSession,
  withFooter: boolean,
): string {
  const where = session.location_text ? ` at ${session.location_text}` : "";
  const til = `(til ~${shortTime(session.expires_at)})`;
  const line = `🛞 ${riderName} is riding${where} ${til}`;
  return withFooter ? `${line}\n${FOOTER}` : line;
}

export function whoReply(sessions: LiveSessionWithRider[]): string {
  if (sessions.length === 0) return "Nobody's out right now. Text RIDING to change that.";
  const lines = sessions.map((s) => {
    const where = s.location_text ? ` at ${s.location_text}` : "";
    return `• ${s.display_name}${where} (til ~${shortTime(s.expires_at)})`;
  });
  return `Out right now:\n${lines.join("\n")}`;
}

export function whereReply(name: string, session: RideSession | undefined): string {
  if (!session) return `${name} isn't out right now.`;
  if (!session.location_text) return `${name} is riding but didn't drop a spot.`;
  return `${name} is at ${session.location_text} (til ~${shortTime(session.expires_at)}).`;
}

export const HELP_TEXT = [
  "Rollcall commands:",
  "RIDING <place> — go live, ping your crew",
  "DONE — end your ride (crew not pinged)",
  "WHO — see who's out",
  "WHERE <name> — get someone's spot",
  "+3h — add 3 hours",
  "NAME <you> — set your display name",
  "MUTE / UNMUTE — pause/resume pings",
  "STOP — opt out of all texts",
].join("\n");

export const WELCOME_TEXT = [
  "Welcome to Rollcall 🛞 — text RIDING to let your crew know you're out.",
  "",
  HELP_TEXT,
].join("\n");

export const UNKNOWN_HINT =
  "Didn't catch that. Text RIDING to go live, WHO to see who's out, or HELP for all commands.";

export const PRIVATE_BETA_REPLY =
  "This is a private Rollcall beta — your number isn't on a crew yet. Ask whoever invited you to add you.";

export function ridingConfirmation(session: RideSession): string {
  const where = session.location_text ? ` at ${session.location_text}` : "";
  return `You're live${where} til ~${shortTime(session.expires_at)}. Crew notified. Text DONE when you're off.`;
}

export const DONE_CONFIRMATION = "You're off the board. Ride safe. 🛞";

export function extendConfirmation(session: RideSession): string {
  return `Extended — you're live til ~${shortTime(session.expires_at)}.`;
}

export const NOTHING_TO_EXTEND = "You're not live right now. Text RIDING to go out.";
export const NOTHING_TO_END = "You weren't live anyway.";

export function nameConfirmation(name: string): string {
  return `Got it — you'll show up as ${name}.`;
}

export const NAME_REQUIRED = "Text NAME followed by what you'd like to be called, e.g. NAME Stiwi.";
export const WHERE_REQUIRED = "Text WHERE followed by a name, e.g. WHERE Stiwi.";
export const MUTED_CONFIRMATION = "Muted — you won't get ride pings. Text UNMUTE to turn them back on.";
export const UNMUTED_CONFIRMATION = "Unmuted — you'll get ride pings again.";
