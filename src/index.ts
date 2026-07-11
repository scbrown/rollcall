/**
 * Rollcall service entrypoint: HTTP server + expiry sweep in one process.
 */

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { config } from "./config.js";
import { webhook } from "./routes/webhook.js";
import { startSweep } from "./sweep.js";
import "./db/index.js"; // open + migrate the database on boot

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok", service: "rollcall" }));
app.route("/", webhook);

startSweep();

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`🛞 Rollcall listening on :${info.port}`);
  if (config.dryRun) {
    console.log("   DRY_RUN=true — signature checks skipped, no real SMS sent.");
  }
});
