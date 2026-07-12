/**
 * Rollcall service entrypoint: HTTP server + expiry sweep in one process.
 */

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { config } from "./config.js";
import { webhook } from "./routes/webhook.js";
import { admin } from "./admin/routes.js";
import { adminEnabled } from "./admin/auth.js";
import { startSweep } from "./sweep.js";
import "./db/index.js"; // open + migrate the database on boot

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok", service: "rollcall" }));
app.route("/", webhook);
app.route("/admin", admin);

startSweep();

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`🛞 Rollcall listening on :${info.port}`);
  if (config.dryRun) {
    console.log("   DRY_RUN=true — signature checks skipped, no real SMS sent.");
  }
  console.log(
    adminEnabled()
      ? `   Admin panel at /admin`
      : "   Admin panel disabled (set ADMIN_PASSWORD to enable).",
  );
});
