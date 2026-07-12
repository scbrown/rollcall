/**
 * Server-rendered HTML for the admin panel. Plain template strings — no client
 * build step. Everything user-supplied goes through esc() before interpolation.
 */

import type { CrewWithCount } from "../domain/riders.js";
import type { LiveSessionWithRider } from "../domain/sessions.js";
import type { Crew, Rider } from "../domain/types.js";
import type { LogRow } from "../domain/messages.js";
import { shortTime } from "../sms/format.js";

export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const STYLE = `
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;
  background:#0e1524;color:#e2e8f0;line-height:1.5}
a{color:#5eead4;text-decoration:none}a:hover{text-decoration:underline}
header{background:#141d33;border-bottom:1px solid #2a3550;padding:14px 24px;
  display:flex;align-items:center;gap:20px;flex-wrap:wrap}
header .brand{font-weight:800;font-size:20px;letter-spacing:-.5px;color:#f8fafc}
header .brand span{color:#5eead4}
header nav{display:flex;gap:18px;font-size:14px;flex:1}
header form{margin:0}
main{max-width:960px;margin:0 auto;padding:28px 24px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 12px;color:#cbd5e1}
.sub{color:#7c8aa5;font-size:14px;margin:0 0 24px}
.card{background:#141d33;border:1px solid #2a3550;border-radius:12px;padding:18px;margin-bottom:16px}
.grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}
.stat{background:#141d33;border:1px solid #2a3550;border-radius:12px;padding:16px}
.stat .n{font-size:28px;font-weight:800;color:#5eead4}
.stat .l{font-size:13px;color:#7c8aa5;text-transform:uppercase;letter-spacing:.5px}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{text-align:left;padding:10px 12px;border-bottom:1px solid #223049}
th{color:#7c8aa5;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.5px}
tr:last-child td{border-bottom:none}
input,select{background:#0b1120;border:1px solid #2a3550;color:#e2e8f0;
  border-radius:8px;padding:9px 11px;font-size:14px;font-family:inherit}
input:focus,select:focus{outline:none;border-color:#38bdf8}
label{display:block;font-size:13px;color:#9fb0c9;margin:0 0 5px}
.field{margin-bottom:12px}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:end}
.row .field{flex:1;min-width:140px;margin-bottom:0}
button{background:#5eead4;color:#06231f;border:none;border-radius:8px;
  padding:9px 16px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit}
button:hover{background:#7ff0dd}
button.ghost{background:transparent;color:#9fb0c9;border:1px solid #2a3550}
button.ghost:hover{background:#1b2540;color:#e2e8f0}
button.danger{background:transparent;color:#f87171;border:1px solid #7f1d1d}
button.danger:hover{background:#7f1d1d;color:#fff}
.pill{display:inline-block;font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;
  text-transform:uppercase;letter-spacing:.5px}
.pill.live{background:#052e2b;color:#5eead4;border:1px solid #14b8a6}
.pill.muted{background:#2a1f05;color:#fbbf24;border:1px solid #a16207}
.pill.out{background:#3a0d0d;color:#f87171;border:1px solid #b91c1c}
.inline{display:inline}
.muted-text{color:#7c8aa5}
.empty{color:#7c8aa5;padding:24px;text-align:center}
.login{max-width:360px;margin:12vh auto;text-align:center}
.login .card{text-align:left}
.mono{font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:13px}
.dir-in{color:#5eead4}.dir-out{color:#38bdf8}
.flash{background:#052e2b;border:1px solid #14b8a6;color:#5eead4;
  border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:14px}
.flash.err{background:#3a0d0d;border-color:#b91c1c;color:#fca5a5}
`;

function nav(authed: boolean): string {
  if (!authed) return "";
  return `<nav>
    <a href="/admin">Dashboard</a>
    <a href="/admin/crews">Crews</a>
    <a href="/admin/live">Live now</a>
    <a href="/admin/log">Message log</a>
  </nav>
  <form method="post" action="/admin/logout"><button class="ghost" type="submit">Log out</button></form>`;
}

export function layout(
  title: string,
  body: string,
  opts: { authed: boolean } = { authed: true },
): string {
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)} · Rollcall admin</title><style>${STYLE}</style></head>
<body>
<header>
  <div class="brand">🛞 roll<span>call</span> admin</div>
  ${nav(opts.authed)}
</header>
<main>${body}</main>
</body></html>`;
}

function flash(msg: string | undefined, isError = false): string {
  if (!msg) return "";
  return `<div class="flash${isError ? " err" : ""}">${esc(msg)}</div>`;
}

export function loginPage(error?: string): string {
  return layout(
    "Log in",
    `<div class="login">
      <h1>🛞 Rollcall admin</h1>
      <p class="sub">Enter the admin password to continue.</p>
      ${flash(error, true)}
      <div class="card">
        <form method="post" action="/admin/login">
          <div class="field">
            <label for="pw">Password</label>
            <input id="pw" name="password" type="password" autofocus required style="width:100%">
          </div>
          <button type="submit" style="width:100%">Log in</button>
        </form>
      </div>
    </div>`,
    { authed: false },
  );
}

export function disabledPage(): string {
  return layout(
    "Admin disabled",
    `<h1>Admin panel is disabled</h1>
     <p class="sub">Set the <span class="mono">ADMIN_PASSWORD</span> environment
     variable and restart the service to enable the admin interface.</p>`,
    { authed: false },
  );
}

export function dashboardPage(
  crews: CrewWithCount[],
  liveCount: number,
  riderCount: number,
): string {
  const crewRows =
    crews.length === 0
      ? `<div class="empty">No crews yet. Create one below.</div>`
      : `<table><thead><tr><th>Crew</th><th>Riders</th><th></th></tr></thead><tbody>
        ${crews
          .map(
            (c) => `<tr>
          <td><a href="/admin/crews/${esc(c.id)}">${esc(c.name)}</a></td>
          <td>${c.rider_count}</td>
          <td style="text-align:right"><a href="/admin/crews/${esc(c.id)}">Manage →</a></td>
        </tr>`,
          )
          .join("")}
      </tbody></table>`;

  return layout(
    "Dashboard",
    `<h1>Dashboard</h1>
     <p class="sub">Seed and manage crews, riders, and who's out.</p>
     <div class="grid">
       <div class="stat"><div class="n">${liveCount}</div><div class="l">Out now</div></div>
       <div class="stat"><div class="n">${riderCount}</div><div class="l">Riders</div></div>
       <div class="stat"><div class="n">${crews.length}</div><div class="l">Crews</div></div>
     </div>
     <h2>Crews</h2>
     <div class="card">${crewRows}</div>
     <h2>New crew</h2>
     <div class="card">
       <form method="post" action="/admin/crews" class="row">
         <div class="field"><label>Crew name</label><input name="name" required placeholder="ATL Floaters"></div>
         <button type="submit">Create crew</button>
       </form>
     </div>`,
  );
}

export function crewDetailPage(
  crew: Crew,
  riders: Rider[],
  liveRiderIds: Set<string>,
  allCrews: Crew[],
  msg?: string,
): string {
  const riderRows =
    riders.length === 0
      ? `<div class="empty">No riders in this crew yet. Add one below.</div>`
      : `<table><thead><tr><th>Name</th><th>Phone</th><th>Status</th><th></th></tr></thead><tbody>
        ${riders
          .map((r) => {
            const status = liveRiderIds.has(r.id)
              ? `<span class="pill live">live</span>`
              : r.opted_out
                ? `<span class="pill out">opted out</span>`
                : r.muted
                  ? `<span class="pill muted">muted</span>`
                  : `<span class="muted-text">—</span>`;
            const crewOptions = allCrews
              .map(
                (c) =>
                  `<option value="${esc(c.id)}"${c.id === r.crew_id ? " selected" : ""}>${esc(c.name)}</option>`,
              )
              .join("");
            return `<tr>
              <td>
                <form method="post" action="/admin/riders/${esc(r.id)}/update" class="row" style="gap:6px">
                  <input name="display_name" value="${esc(r.display_name)}" style="width:130px">
                  <select name="crew_id" style="width:150px">${crewOptions}</select>
                  <button class="ghost" type="submit">Save</button>
                </form>
              </td>
              <td class="mono">${esc(r.phone)}</td>
              <td>${status}</td>
              <td style="text-align:right;white-space:nowrap">
                <form method="post" action="/admin/riders/${esc(r.id)}/${r.muted ? "unmute" : "mute"}" class="inline">
                  <button class="ghost" type="submit">${r.muted ? "Unmute" : "Mute"}</button>
                </form>
                <form method="post" action="/admin/riders/${esc(r.id)}/delete" class="inline"
                  onsubmit="return confirm('Remove ${esc(r.display_name)}?')">
                  <button class="danger" type="submit">Remove</button>
                </form>
              </td>
            </tr>`;
          })
          .join("")}
      </tbody></table>`;

  return layout(
    crew.name,
    `<p class="sub"><a href="/admin/crews">← All crews</a></p>
     <h1>${esc(crew.name)}</h1>
     <p class="sub">${riders.length} rider${riders.length === 1 ? "" : "s"}</p>
     ${flash(msg)}
     <div class="card">${riderRows}</div>
     <h2>Add rider</h2>
     <div class="card">
       <form method="post" action="/admin/riders" class="row">
         <input type="hidden" name="crew_id" value="${esc(crew.id)}">
         <div class="field"><label>Name</label><input name="display_name" required placeholder="Stiwi"></div>
         <div class="field"><label>Phone (E.164)</label><input name="phone" required placeholder="+14045551234" class="mono"></div>
         <button type="submit">Add rider</button>
       </form>
     </div>`,
  );
}

export function crewsPage(crews: CrewWithCount[]): string {
  const rows =
    crews.length === 0
      ? `<div class="empty">No crews yet.</div>`
      : `<table><thead><tr><th>Crew</th><th>Riders</th><th></th></tr></thead><tbody>
      ${crews
        .map(
          (c) => `<tr>
        <td><a href="/admin/crews/${esc(c.id)}">${esc(c.name)}</a></td>
        <td>${c.rider_count}</td>
        <td style="text-align:right"><a href="/admin/crews/${esc(c.id)}">Manage →</a></td>
      </tr>`,
        )
        .join("")}
    </tbody></table>`;
  return layout(
    "Crews",
    `<h1>Crews</h1><p class="sub">Each rider belongs to exactly one crew.</p>
     <div class="card">${rows}</div>
     <h2>New crew</h2>
     <div class="card">
       <form method="post" action="/admin/crews" class="row">
         <div class="field"><label>Crew name</label><input name="name" required placeholder="ATL Floaters"></div>
         <button type="submit">Create crew</button>
       </form>
     </div>`,
  );
}

export function livePage(sessions: LiveSessionWithRider[]): string {
  const rows =
    sessions.length === 0
      ? `<div class="empty">Nobody's out right now.</div>`
      : `<table><thead><tr><th>Rider</th><th>Where</th><th>Til</th><th></th></tr></thead><tbody>
      ${sessions
        .map(
          (s) => `<tr>
        <td>${esc(s.display_name)} <span class="pill live">live</span></td>
        <td>${s.location_text ? esc(s.location_text) : '<span class="muted-text">—</span>'}</td>
        <td>~${esc(shortTime(s.expires_at))}</td>
        <td style="text-align:right">
          <form method="post" action="/admin/sessions/${esc(s.id)}/end" class="inline">
            <button class="ghost" type="submit">End</button>
          </form>
        </td>
      </tr>`,
        )
        .join("")}
    </tbody></table>`;
  return layout(
    "Live now",
    `<h1>Out right now</h1>
     <p class="sub">Live sessions across every crew. Ending one here is silent — the rider isn't texted.</p>
     <div class="card">${rows}</div>`,
  );
}

export function logPage(rows: LogRow[]): string {
  const body =
    rows.length === 0
      ? `<div class="empty">No messages logged yet.</div>`
      : `<table><thead><tr><th>When</th><th>Dir</th><th>Phone</th><th>Body</th></tr></thead><tbody>
      ${rows
        .map(
          (r) => `<tr>
        <td class="muted-text mono">${esc(r.created_at)}</td>
        <td class="mono ${r.direction === "in" ? "dir-in" : "dir-out"}">${esc(r.direction)}</td>
        <td class="mono">${esc(r.phone)}</td>
        <td>${esc(r.body)}</td>
      </tr>`,
        )
        .join("")}
    </tbody></table>`;
  return layout(
    "Message log",
    `<h1>Message log</h1>
     <p class="sub">Most recent 100 inbound/outbound messages. Pruned after the retention window.</p>
     <div class="card" style="overflow-x:auto">${body}</div>`,
  );
}
