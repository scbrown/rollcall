/**
 * Admin panel routes, mounted at /admin. Server-rendered, form-POST driven,
 * Post/Redirect/Get so refreshes don't re-submit. All routes behind the
 * password gate except the login page itself.
 */

import { Hono } from "hono";
import {
  adminEnabled,
  clearSession,
  isAuthed,
  issueSession,
  passwordMatches,
  requireAdmin,
} from "./auth.js";
import * as views from "./views.js";
import {
  crewMembers,
  deleteRider,
  findRiderByPhone,
  getCrew,
  getRider,
  listCrewsWithCounts,
  setMuted,
  updateRider,
  upsertCrew,
  upsertRider,
} from "../domain/riders.js";
import {
  allLiveSessions,
  endSessionById,
  liveSessionsInCrew,
} from "../domain/sessions.js";
import { recentLog } from "../domain/messages.js";
import { db } from "../db/index.js";

const E164 = /^\+[1-9]\d{6,14}$/;

export const admin = new Hono();

// Gate: disabled → explain; unauthenticated → login (except the login page).
admin.use("*", async (c, next) => {
  if (!adminEnabled()) return c.html(views.disabledPage());
  if (c.req.path !== "/admin/login" && !isAuthed(c)) {
    return c.redirect("/admin/login");
  }
  await next();
});

// --- auth ---

admin.get("/login", (c) => {
  if (isAuthed(c)) return c.redirect("/admin");
  return c.html(views.loginPage());
});

admin.post("/login", async (c) => {
  const body = await c.req.parseBody();
  const password = typeof body.password === "string" ? body.password : "";
  if (!passwordMatches(password)) {
    return c.html(views.loginPage("Wrong password."), 401);
  }
  issueSession(c);
  return c.redirect("/admin");
});

admin.post("/logout", requireAdmin, (c) => {
  clearSession(c);
  return c.redirect("/admin/login");
});

// --- dashboard ---

admin.get("/", requireAdmin, (c) => {
  const crews = listCrewsWithCounts();
  const liveCount = allLiveSessions().length;
  const riderCount = (
    db.prepare("SELECT COUNT(*) AS n FROM riders").get() as { n: number }
  ).n;
  return c.html(views.dashboardPage(crews, liveCount, riderCount));
});

// --- crews ---

admin.get("/crews", requireAdmin, (c) => {
  return c.html(views.crewsPage(listCrewsWithCounts()));
});

admin.post("/crews", requireAdmin, async (c) => {
  const body = await c.req.parseBody();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name !== "") upsertCrew(name);
  return c.redirect("/admin/crews");
});

admin.get("/crews/:id", requireAdmin, (c) => {
  const crew = getCrew(c.req.param("id"));
  if (!crew) return c.redirect("/admin/crews");
  const riders = crewMembers(crew.id);
  const liveIds = new Set(liveSessionsInCrew(crew.id).map((s) => s.rider_id));
  const allCrews = listCrewsWithCounts();
  const msg = c.req.query("msg") ?? c.req.query("err");
  return c.html(views.crewDetailPage(crew, riders, liveIds, allCrews, msg));
});

// --- riders ---

admin.post("/riders", requireAdmin, async (c) => {
  const body = await c.req.parseBody();
  const name = typeof body.display_name === "string" ? body.display_name.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const crewId = typeof body.crew_id === "string" ? body.crew_id : "";

  const back = `/admin/crews/${encodeURIComponent(crewId)}`;
  if (!E164.test(phone)) {
    return c.redirect(`${back}?err=${encodeURIComponent(`"${phone}" isn't a valid E.164 number (e.g. +14045551234).`)}`);
  }
  const existing = findRiderByPhone(phone);
  if (existing) {
    return c.redirect(`${back}?err=${encodeURIComponent(`${phone} is already registered as ${existing.display_name}.`)}`);
  }
  if (name === "") return c.redirect(`${back}?err=${encodeURIComponent("Name is required.")}`);

  upsertRider(phone, name, crewId);
  return c.redirect(`${back}?msg=${encodeURIComponent(`Added ${name}.`)}`);
});

admin.post("/riders/:id/update", requireAdmin, async (c) => {
  const rider = getRider(c.req.param("id"));
  if (!rider) return c.redirect("/admin/crews");
  const body = await c.req.parseBody();
  const name = typeof body.display_name === "string" ? body.display_name.trim() : rider.display_name;
  const crewId = typeof body.crew_id === "string" ? body.crew_id : rider.crew_id ?? "";
  if (name !== "") updateRider(rider.id, name, crewId);
  return c.redirect(`/admin/crews/${encodeURIComponent(crewId)}`);
});

admin.post("/riders/:id/mute", requireAdmin, (c) => {
  const rider = getRider(c.req.param("id"));
  if (rider) setMuted(rider.id, true);
  return c.redirect(`/admin/crews/${encodeURIComponent(rider?.crew_id ?? "")}`);
});

admin.post("/riders/:id/unmute", requireAdmin, (c) => {
  const rider = getRider(c.req.param("id"));
  if (rider) setMuted(rider.id, false);
  return c.redirect(`/admin/crews/${encodeURIComponent(rider?.crew_id ?? "")}`);
});

admin.post("/riders/:id/delete", requireAdmin, (c) => {
  const rider = getRider(c.req.param("id"));
  const crewId = rider?.crew_id ?? "";
  if (rider) deleteRider(rider.id);
  return c.redirect(`/admin/crews/${encodeURIComponent(crewId)}`);
});

// --- live sessions ---

admin.get("/live", requireAdmin, (c) => {
  return c.html(views.livePage(allLiveSessions()));
});

admin.post("/sessions/:id/end", requireAdmin, (c) => {
  endSessionById(c.req.param("id"));
  return c.redirect("/admin/live");
});

// --- message log ---

admin.get("/log", requireAdmin, (c) => {
  return c.html(views.logPage(recentLog(100)));
});
