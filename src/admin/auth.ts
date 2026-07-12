/**
 * Admin authentication: a single shared password (ADMIN_PASSWORD) exchanged for
 * a signed, HttpOnly, SameSite=Strict session cookie. No user table — this is a
 * single-operator tool.
 *
 * Cookie value is `<expiresAtMs>.<hex hmac>`, signed with the session secret.
 * Verification is constant-time and checks expiry.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Context, MiddlewareHandler } from "hono";
import { config } from "../config.js";

const COOKIE_NAME = "rollcall_admin";

// Stable secret if configured, otherwise a per-boot random one.
const SECRET =
  config.admin.sessionSecret !== ""
    ? config.admin.sessionSecret
    : randomBytes(32).toString("hex");

if (config.admin.password !== "" && config.admin.sessionSecret === "") {
  console.warn(
    "[admin] ADMIN_SESSION_SECRET not set — using a random per-boot secret; " +
      "admin sessions will end on restart.",
  );
}

/** True when the admin panel is enabled (a password is configured). */
export function adminEnabled(): boolean {
  return config.admin.password !== "";
}

function sign(expiresAtMs: number): string {
  const mac = createHmac("sha256", SECRET).update(String(expiresAtMs)).digest("hex");
  return `${expiresAtMs}.${mac}`;
}

function verify(token: string | undefined): boolean {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot === -1) return false;
  const expiresAtMs = Number(token.slice(0, dot));
  if (!Number.isFinite(expiresAtMs) || expiresAtMs < Date.now()) return false;

  const expected = sign(expiresAtMs);
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Constant-time password check against the configured admin password. */
export function passwordMatches(candidate: string): boolean {
  const a = Buffer.from(candidate);
  const b = Buffer.from(config.admin.password);
  // Compare against a padded copy to avoid leaking length, then require equal length.
  if (a.length !== b.length) {
    // Still burn a comparison to keep timing uniform.
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function issueSession(c: Context): void {
  const expiresAtMs = Date.now() + config.admin.sessionHours * 3600_000;
  setCookie(c, COOKIE_NAME, sign(expiresAtMs), {
    httpOnly: true,
    sameSite: "Strict",
    secure: !config.dryRun, // allow http on localhost during dev
    path: "/",
    maxAge: config.admin.sessionHours * 3600,
  });
}

export function clearSession(c: Context): void {
  deleteCookie(c, COOKIE_NAME, { path: "/" });
}

export function isAuthed(c: Context): boolean {
  return verify(getCookie(c, COOKIE_NAME));
}

/** Middleware: require a valid session, else redirect to the login page. */
export const requireAdmin: MiddlewareHandler = async (c, next) => {
  if (!isAuthed(c)) return c.redirect("/admin/login");
  await next();
};
