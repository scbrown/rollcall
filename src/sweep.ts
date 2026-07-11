/**
 * In-process expiry sweep. Every SWEEP_INTERVAL_SECONDS it marks any lapsed
 * ride session as ended (silently — no fan-out on expiry) and periodically
 * prunes the message log per the retention policy.
 */

import { config } from "./config.js";
import { sweepExpired } from "./domain/sessions.js";
import { pruneLog } from "./domain/messages.js";

let timer: NodeJS.Timeout | null = null;
let ticksSincePrune = 0;

// Prune roughly once an hour rather than every tick.
const PRUNE_EVERY_TICKS = Math.max(1, Math.round(3600 / config.sweepIntervalSeconds));

export function runSweepOnce(): void {
  const swept = sweepExpired();
  if (swept > 0) {
    console.log(`[sweep] expired ${swept} session(s)`);
  }

  if (++ticksSincePrune >= PRUNE_EVERY_TICKS) {
    ticksSincePrune = 0;
    const pruned = pruneLog(config.logRetentionDays);
    if (pruned > 0) {
      console.log(`[sweep] pruned ${pruned} old log row(s)`);
    }
  }
}

export function startSweep(): void {
  if (timer) return;
  timer = setInterval(runSweepOnce, config.sweepIntervalSeconds * 1000);
  // Don't keep the event loop alive solely for the sweep.
  timer.unref?.();
  console.log(`[sweep] running every ${config.sweepIntervalSeconds}s`);
}

export function stopSweep(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
