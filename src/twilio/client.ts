/**
 * Outbound SMS via the Twilio REST API, plus message logging.
 *
 * In DRY_RUN mode nothing is sent — messages are logged to the console and to
 * message_log — so the whole grammar can be exercised locally with no Twilio
 * account and no cost.
 */

import twilio from "twilio";
import { config } from "../config.js";
import { recordOutbound } from "../domain/messages.js";
import type { OutboundMessage } from "../sms/commands.js";

const client = config.dryRun
  ? null
  : twilio(config.twilio.accountSid, config.twilio.authToken);

/** Send a single SMS. Logs it either way; swallows per-message send errors. */
export async function sendSms(to: string, body: string): Promise<void> {
  if (config.dryRun || client === null) {
    console.log(`[DRY_RUN SMS] → ${to}: ${body.replace(/\n/g, " ⏎ ")}`);
    recordOutbound(to, body);
    return;
  }

  try {
    const message = await client.messages.create({
      to,
      from: config.twilio.fromNumber,
      body,
    });
    recordOutbound(to, body, message.sid);
  } catch (err) {
    // One bad recipient (e.g. a stale number) shouldn't sink the whole fan-out.
    console.error(`Failed to send to ${to}:`, err);
    recordOutbound(to, body);
  }
}

/** Fan out a batch of messages concurrently. */
export async function sendBatch(messages: OutboundMessage[]): Promise<void> {
  await Promise.all(messages.map((m) => sendSms(m.to, m.body)));
}
