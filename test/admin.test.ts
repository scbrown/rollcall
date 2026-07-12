import { beforeEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { db } from "../src/db/index.js";
import { upsertCrew } from "../src/domain/riders.js";
import { admin } from "../src/admin/routes.js";

// Mount exactly as production does so c.req.path is "/admin/...".
const app = new Hono();
app.route("/admin", admin);

function form(fields: Record<string, string>): Request {
  const body = new URLSearchParams(fields);
  return new Request("http://local/admin/login", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
}

beforeEach(() => {
  db.exec("DELETE FROM ride_sessions; DELETE FROM riders; DELETE FROM crews;");
});

describe("admin auth gate", () => {
  it("redirects unauthenticated requests to the login page", async () => {
    const res = await app.request("/admin");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/admin/login");
  });

  it("serves the login page without auth", async () => {
    const res = await app.request("/admin/login");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Rollcall admin");
  });

  it("rejects a wrong password with 401 and no cookie", async () => {
    const res = await app.request(form({ password: "nope" }));
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("accepts the right password, sets an HttpOnly cookie, and grants access", async () => {
    const login = await app.request(form({ password: "test-admin-pw" }));
    expect(login.status).toBe(302);
    const cookie = login.headers.get("set-cookie");
    expect(cookie).toContain("rollcall_admin=");
    expect(cookie).toContain("HttpOnly");

    const token = cookie!.split(";")[0]!;
    const dash = await app.request("/admin", { headers: { cookie: token } });
    expect(dash.status).toBe(200);
    expect(await dash.text()).toContain("Dashboard");
  });

  it("rejects a forged/garbage cookie", async () => {
    const res = await app.request("/admin", {
      headers: { cookie: "rollcall_admin=9999999999999.deadbeef" },
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/admin/login");
  });
});

describe("admin crew creation", () => {
  async function authedCookie(): Promise<string> {
    const login = await app.request(form({ password: "test-admin-pw" }));
    return login.headers.get("set-cookie")!.split(";")[0]!;
  }

  it("creates a crew via POST and lists it", async () => {
    const cookie = await authedCookie();
    const create = await app.request("/admin/crews", {
      method: "POST",
      headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ name: "Night Owls" }),
    });
    expect(create.status).toBe(302);

    const list = await app.request("/admin/crews", { headers: { cookie } });
    expect(await list.text()).toContain("Night Owls");
  });

  it("rejects an invalid E.164 rider phone", async () => {
    const cookie = await authedCookie();
    const crewId = upsertCrew("Test Crew");
    const res = await app.request("/admin/riders", {
      method: "POST",
      headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        display_name: "Bad",
        phone: "404-555-1234",
        crew_id: crewId,
      }),
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("err=");
  });
});
