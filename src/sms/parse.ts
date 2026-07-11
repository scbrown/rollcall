/**
 * Inbound SMS command parser. Keywords are case-insensitive; the first token
 * decides the command. See docs/mvp-spec.md §4 for the grammar.
 */

export type Command =
  | { kind: "riding"; location: string | null }
  | { kind: "done" }
  | { kind: "who" }
  | { kind: "where"; name: string }
  | { kind: "extend"; hours: number }
  | { kind: "name"; displayName: string }
  | { kind: "mute" }
  | { kind: "unmute" }
  | { kind: "help" }
  | { kind: "stop" }
  | { kind: "start" }
  | { kind: "unknown" };

/** Match a bare duration extend like "+3h", "+2", "extend". */
function parseExtend(token: string, rest: string): number | null {
  const lower = token.toLowerCase();
  if (lower === "extend") return 3;
  // +3h, +3, +90m style. Default unit is hours.
  const match = lower.match(/^\+(\d+)(h|hr|hours?|m|min)?$/);
  if (!match) return null;
  const value = Number.parseInt(match[1]!, 10);
  const unit = match[2] ?? "h";
  if (unit.startsWith("m")) return Math.max(value / 60, 0);
  return value;
}

export function parseCommand(raw: string): Command {
  const trimmed = raw.trim();
  if (trimmed === "") return { kind: "unknown" };

  const spaceIndex = trimmed.search(/\s/);
  const first = spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex);
  const rest = spaceIndex === -1 ? "" : trimmed.slice(spaceIndex + 1).trim();
  const keyword = first.toLowerCase();

  switch (keyword) {
    case "riding":
    case "ride":
      return { kind: "riding", location: rest === "" ? null : rest };
    case "done":
    case "off":
      return { kind: "done" };
    case "who":
    case "who's":
      return { kind: "who" };
    case "where":
      return { kind: "where", name: rest };
    case "name":
      return { kind: "name", displayName: rest };
    case "mute":
      return { kind: "mute" };
    case "unmute":
      return { kind: "unmute" };
    case "help":
    case "info":
      return { kind: "help" };
    case "stop":
    case "stopall":
    case "unsubscribe":
    case "cancel":
    case "quit":
      return { kind: "stop" };
    case "start":
    case "unstop":
    case "yes":
      return { kind: "start" };
    case "extend":
      return { kind: "extend", hours: 3 };
    default: {
      const hours = parseExtend(first, rest);
      if (hours !== null) return { kind: "extend", hours };
      return { kind: "unknown" };
    }
  }
}
