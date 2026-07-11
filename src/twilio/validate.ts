/**
 * Validate the X-Twilio-Signature header on inbound webhook requests.
 *
 * Twilio signs an HMAC-SHA1 over the full request URL plus the sorted POST
 * params. The URL must match what's configured in the Twilio console exactly,
 * which is why we sign against config.twilio.webhookUrl rather than
 * reconstructing it from proxy-mangled request headers.
 */

import twilio from "twilio";
import { config } from "../config.js";

export function isValidTwilioSignature(
  signature: string | undefined,
  params: Record<string, string>,
): boolean {
  if (config.dryRun) return true; // local dev convenience
  if (!signature) return false;
  return twilio.validateRequest(
    config.twilio.authToken,
    signature,
    config.twilio.webhookUrl,
    params,
  );
}
