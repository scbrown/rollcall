/**
 * POST /webhooks/twilio — the single inbound SMS endpoint.
 *
 * Flow: validate signature → dedupe on MessageSid → dispatch → reply to the
 * sender with TwiML and fan out to the crew via the REST API.
 */

import { Hono } from "hono";
import { isValidTwilioSignature } from "../twilio/validate.js";
import { sendBatch } from "../twilio/client.js";
import { handleInbound } from "../sms/commands.js";
import { recordInbound } from "../domain/messages.js";

/** Minimal TwiML message response. Escapes the five XML entities. */
function twiml(message: string | null): string {
  if (message === null) return `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
  const escaped = message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`;
}

const XML_HEADERS = { "Content-Type": "text/xml" } as const;

export const webhook = new Hono();

webhook.post("/webhooks/twilio", async (c) => {
  const form = await c.req.formData();
  const params: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") params[key] = value;
  }

  const signature = c.req.header("X-Twilio-Signature");
  if (!isValidTwilioSignature(signature, params)) {
    return c.text("Invalid signature", 403);
  }

  const from = params["From"] ?? "";
  const body = params["Body"] ?? "";
  const sid = params["MessageSid"] ?? "";

  if (from === "" || sid === "") {
    return c.text("Bad request", 400);
  }

  // Idempotency: carriers retry webhook deliveries. If we've seen this SID,
  // acknowledge without re-processing.
  const isNew = recordInbound(sid, from, body);
  if (!isNew) {
    return c.body(twiml(null), 200, XML_HEADERS);
  }

  const result = handleInbound(from, body);

  // Fan-out is fire-and-forget relative to the webhook response, but we still
  // await it so the process doesn't drop sends if it's shutting down.
  if (result.fanout.length > 0) {
    await sendBatch(result.fanout);
  }

  return c.body(twiml(result.reply), 200, XML_HEADERS);
});
