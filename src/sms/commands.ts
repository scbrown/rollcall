/**
 * Command dispatch: given the sender's phone and a message body, mutate state
 * and return what to send. `reply` goes back to the sender; `fanout` is the set
 * of messages to push to the crew via the Twilio REST API.
 *
 * This layer is deliberately free of HTTP and Twilio concerns so it can be
 * unit-tested against an in-memory database.
 */

import { parseCommand } from "./parse.js";
import * as fmt from "./format.js";
import {
  crewFanoutTargets,
  findCrewRiderByName,
  findRiderByPhone,
  markFooterShown,
  markWelcomed,
  setDisplayName,
  setMuted,
  setOptedOut,
} from "../domain/riders.js";
import {
  endRide,
  extendRide,
  liveSessionFor,
  liveSessionsInCrew,
  startOrRefreshRide,
} from "../domain/sessions.js";
import type { Rider } from "../domain/types.js";

export interface OutboundMessage {
  to: string;
  body: string;
}

export interface HandlerResult {
  /** Message to send back to the sender (null = stay silent). */
  reply: string | null;
  /** Additional messages to fan out to the crew. */
  fanout: OutboundMessage[];
}

const THIRTY_DAYS_MS = 30 * 24 * 3600 * 1000;

function footerDue(rider: Rider): boolean {
  if (!rider.footer_shown_at) return true;
  const last = new Date(rider.footer_shown_at.replace(" ", "T") + "Z").getTime();
  return Date.now() - last > THIRTY_DAYS_MS;
}

/** Handle a message from a known rider. */
export function handleForRider(rider: Rider, body: string): HandlerResult {
  const cmd = parseCommand(body);

  // A first message from a known-but-un-welcomed rider gets the welcome
  // prepended, whatever the command was.
  const welcomePrefix = !rider.welcomed_at ? fmt.WELCOME_TEXT + "\n\n" : "";
  const withWelcome = (reply: string | null): string | null => {
    if (!rider.welcomed_at) markWelcomed(rider.id);
    if (reply === null) return welcomePrefix === "" ? null : welcomePrefix.trimEnd();
    return welcomePrefix + reply;
  };

  switch (cmd.kind) {
    case "riding": {
      const session = startOrRefreshRide(rider, cmd.location);
      const fanout: OutboundMessage[] = [];
      for (const target of crewFanoutTargets(rider)) {
        const withFooter = footerDue(target);
        fanout.push({
          to: target.phone,
          body: fmt.fanoutMessage(rider.display_name, session, withFooter),
        });
        if (withFooter) markFooterShown(target.id);
      }
      return { reply: withWelcome(fmt.ridingConfirmation(session)), fanout };
    }

    case "done": {
      const ended = endRide(rider.id);
      return {
        reply: withWelcome(ended ? fmt.DONE_CONFIRMATION : fmt.NOTHING_TO_END),
        fanout: [],
      };
    }

    case "who": {
      const sessions = rider.crew_id ? liveSessionsInCrew(rider.crew_id) : [];
      return { reply: withWelcome(fmt.whoReply(sessions)), fanout: [] };
    }

    case "where": {
      if (cmd.name.trim() === "") return { reply: withWelcome(fmt.WHERE_REQUIRED), fanout: [] };
      const target = rider.crew_id ? findCrewRiderByName(rider.crew_id, cmd.name) : undefined;
      const session = target ? liveSessionFor(target.id) : undefined;
      const label = target?.display_name ?? cmd.name.trim();
      return { reply: withWelcome(fmt.whereReply(label, session)), fanout: [] };
    }

    case "extend": {
      const session = extendRide(rider.id, cmd.hours);
      return {
        reply: withWelcome(session ? fmt.extendConfirmation(session) : fmt.NOTHING_TO_EXTEND),
        fanout: [],
      };
    }

    case "name": {
      if (cmd.displayName.trim() === "") return { reply: withWelcome(fmt.NAME_REQUIRED), fanout: [] };
      setDisplayName(rider.id, cmd.displayName.trim());
      return { reply: withWelcome(fmt.nameConfirmation(cmd.displayName.trim())), fanout: [] };
    }

    case "mute": {
      setMuted(rider.id, true);
      return { reply: withWelcome(fmt.MUTED_CONFIRMATION), fanout: [] };
    }

    case "unmute": {
      setMuted(rider.id, false);
      return { reply: withWelcome(fmt.UNMUTED_CONFIRMATION), fanout: [] };
    }

    case "stop": {
      // Twilio's Advanced Opt-Out sends the carrier confirmation; we just make
      // sure our own state flags the rider so we never fan out to them.
      setOptedOut(rider.id, true);
      return { reply: null, fanout: [] };
    }

    case "start": {
      setOptedOut(rider.id, false);
      return { reply: null, fanout: [] };
    }

    case "help":
      return { reply: withWelcome(fmt.HELP_TEXT), fanout: [] };

    case "unknown":
      return { reply: withWelcome(fmt.UNKNOWN_HINT), fanout: [] };
  }
}

/**
 * Top-level entrypoint. Resolves the phone to a rider and dispatches, or
 * returns the private-beta reply for unknown numbers.
 */
export function handleInbound(fromPhone: string, body: string): HandlerResult {
  const rider = findRiderByPhone(fromPhone);
  if (!rider) {
    return { reply: fmt.PRIVATE_BETA_REPLY, fanout: [] };
  }
  return handleForRider(rider, body);
}
