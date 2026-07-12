# Contributing to Rollcall

Dev notes for working on the SMS ride-presence service. If you've read the
[README](README.md), this is the layer beneath it: how the pieces fit, the
conventions to keep, and the gotchas that'll bite you.

## Setup

Requires **Node ≥ 20** (uses native `fetch`, `node:crypto` `randomUUID`, ESM).

```bash
npm install
cp .env.example .env         # set DRY_RUN=true for local work — no Twilio needed
npm run migrate              # apply schema.sql to the SQLite file
npm run dev                  # tsx watch, reloads on save
```

You almost never need real Twilio credentials to develop. `DRY_RUN=true`:

- skips `X-Twilio-Signature` validation on inbound requests, and
- prints outbound SMS as `[DRY_RUN SMS] → …` instead of sending them.

So the entire grammar is exercisable with `curl` (see the README's "Try it
without Twilio" section).

## Everyday commands

| Command | What it does |
|---------|--------------|
| `npm run dev` | Run the server with hot reload (`tsx watch`) |
| `npm start` | Run once, no watch |
| `npm run migrate` | Apply the schema (idempotent) |
| `npm run seed [file]` | Seed crews/riders from JSON (default `./seed.json`) |
| `npm test` | Run the vitest suite once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run typecheck` | `tsc --noEmit` — must be clean before committing |
| `npm run build` | Emit JS to `dist/` |

## How the code is organized

The guiding rule: **the domain and SMS layers know nothing about HTTP or
Twilio.** That's what keeps `handleInbound` unit-testable against an in-memory
database with zero mocking.

```
routes/webhook.ts   ─ HTTP + TwiML. Validates signature, dedupes, dispatches.
  │
  ▼
sms/commands.ts     ─ The brain. (rider, text) → { reply, fanout[] }. Pure-ish:
  │                   mutates the DB, returns messages. No I/O beyond the DB.
  ├─ sms/parse.ts   ─ text → Command union. No side effects at all.
  └─ sms/format.ts  ─ every user-facing string lives here.
  │
  ▼
domain/*.ts         ─ state: riders, sessions, message_log. Thin SQL wrappers.
  │
  ▼
db/index.ts         ─ the one shared better-sqlite3 connection (WAL).

twilio/*.ts         ─ the only files that import the twilio SDK.
admin/*.ts          ─ the /admin web panel. Reuses domain/*; owns its own
                      auth + HTML. Knows nothing the SMS layer needs to know.
sweep.ts            ─ the expiry ticker, started from index.ts.
```

**The admin panel** (`src/admin/`) is a server-rendered Hono sub-app mounted at
`/admin`, gated by `ADMIN_PASSWORD`. It reuses the same `domain/` functions the
SMS grammar does — no separate data path — and renders plain HTML template
strings (no client build). If you add a page: put queries in `domain/`, the
route in `admin/routes.ts`, and the markup in `admin/views.ts` (run everything
user-supplied through `esc()`). Follow Post/Redirect/Get for mutations, and pass
flash messages via the `?msg=` / `?err=` query params — there's no session store.

**Where to add a new SMS command:**

1. Add a variant to the `Command` union and a `case` in `sms/parse.ts`.
2. Add a `case` in `sms/commands.ts` returning `{ reply, fanout }`.
3. Put any user-facing copy in `sms/format.ts` — don't inline strings.
4. Add domain functions in `domain/` if it touches new state.
5. Write a test in `test/commands.test.ts`.

Keep HTTP and Twilio out of steps 1–4. If you find yourself importing `hono` or
`twilio` outside `routes/` or `twilio/`, something's in the wrong layer.

## Conventions

- **TypeScript strict**, `noUncheckedIndexedAccess` on. Array indexing gives you
  `T | undefined` — the `!` you see after `.get(...)`/`[0]` is deliberate where a
  row is known to exist. Prefer a real guard where it isn't.
- **ESM with `.js` import specifiers.** Because the project is `"type": "module"`
  and compiles with `moduleResolution: bundler`/`tsx`, relative imports are
  written `./foo.js` even though the source is `foo.ts`. Keep that or the build
  breaks.
- **All copy in `format.ts`.** One place to tune tone and to keep fan-out under
  160 GSM-7 chars (one Twilio segment).
- **SQL lives in the `domain/` wrappers**, not in handlers. Handlers call named
  functions, never `db.prepare` directly.
- **Timestamps are UTC text** in the `datetime('now')` format
  (`YYYY-MM-DD HH:MM:SS`), compared lexically. Use `nowSql()` / `hoursFromNowSql()`
  from `db/index.ts` — don't hand-roll date formatting in handlers.

## Data model notes

- A **RideSession is live** iff `ended_at IS NULL AND now() < expires_at`. There
  is no `status` column — liveness is always computed from those two fields. Don't
  add a denormalized flag; the sweep and every query rely on this invariant.
- **Starting a ride while one is live updates it in place** (refreshes expiry,
  replaces location). We never stack duplicate live sessions per rider — see
  `startOrRefreshRide`.
- `lat` / `lng` exist in the schema but are **unused in the MVP**. They're the
  seam for v1.1 geocoded pins; leave them nullable and untouched.
- `muted` (fan-out opt-out, still a crew member) and `opted_out` (carrier-level
  STOP, never message) are **different flags**. `who` ignores `muted`; fan-out
  respects both.

## Gotchas

- **The `+` in `From`.** When testing with `curl -d`, a literal `+14045551234`
  form-decodes to a space. Always use `--data-urlencode "From=+1…"`.
- **Signature is hashed over the exact URL.** `PUBLIC_WEBHOOK_URL` must match the
  Twilio console byte-for-byte (scheme, host, path). A trailing slash or wrong
  host will fail every inbound request in production.
- **`done` and expiry are intentionally silent.** No crew fan-out. If you're
  tempted to "notify when someone leaves," re-read principle #1 — arrivals are
  interesting, departures are noise.
- **Idempotency depends on `MessageSid` uniqueness.** `recordInbound` returns
  `false` on a repeat SID and the webhook short-circuits. Don't process a message
  before that check.
- **The footer is per-recipient.** It shows on a recipient's first-ever fan-out,
  then at most once per 30 days (`footer_shown_at` on the rider row) — not
  per-sender.

## Testing

`test/setup.ts` sets `DRY_RUN=true` and `DATABASE_PATH=:memory:` before any
`src` module loads, so tests run against a throwaway in-memory DB with no Twilio.
Each test file gets its own worker (hence its own database); `commands.test.ts`
resets tables in `beforeEach`.

Prefer testing through `handleInbound` — it's the real entrypoint and exercises
parse + dispatch + state together. Drop to `domain/` unit tests only for logic
that's awkward to reach from a message (e.g. the expiry sweep boundary).

Before you push:

```bash
npm run typecheck && npm test
```

## Commit style

Short imperative subject, a body explaining the *why* when it isn't obvious.
Keep unrelated changes in separate commits. There's no CI gate yet — the
typecheck-and-test pair above is the bar.

## Scope reminder

This repo is the **MVP**: SMS-only, one crew per rider, US numbers, static
location pin. PWA, telemetry auto-start, multiple crews, and geocoding are
explicitly [out of scope](docs/mvp-spec.md#2-non-goals-mvp) here — they're the
next milestones, not this one. New features should earn their place against the
[principles](README.md#-principles) before the code.
