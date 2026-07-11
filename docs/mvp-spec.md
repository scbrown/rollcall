# MVP Spec — SMS Ride Presence

Status: draft v0.1
Scope: SMS-only. No PWA, no auth UI, no telemetry. One crew per rider.

## 1. Goal

A rider texts one Twilio number to go "live"; everyone in their crew gets an
SMS. Friends can ask who's riding and where. Sessions expire on their own.

Success criteria: a 5–10 person crew can use this for a month with zero
support intervention and prefer it over the group thread for "who's riding."

## 2. Non-goals (MVP)

- Live/continuous location tracking (a single static pin only)
- Map claiming, routes, ride recording, stats
- Native or web app of any kind
- Multiple crews per rider, public discovery, stranger matching
- Non-US phone numbers

## 3. Core concepts

### Rider
Identity **is** the phone number (E.164). A rider has a display name and a
crew membership.

### Crew
A named group of riders. MVP: a rider belongs to exactly one crew. Fan-out
scope = your crew minus you.

### RideSession
The only interesting state in the system.

| field        | type      | notes                                        |
|--------------|-----------|----------------------------------------------|
| id           | uuid      |                                              |
| rider_id     | fk        |                                              |
| started_at   | timestamp |                                              |
| expires_at   | timestamp | default started_at + 3h                      |
| ended_at     | timestamp | null while live                              |
| location_text| text?     | free text as typed ("piedmont park")         |
| lat / lng    | float?    | v1.1 — populated by PWA or geocoding, not MVP|

A session is **live** iff `ended_at IS NULL AND now() < expires_at`.
Starting a new session while one is live updates it (refreshes expiry,
replaces location) rather than creating a duplicate.

## 4. SMS grammar

Inbound keywords are case-insensitive; first token decides the command.

| text                  | actor        | effect                                              |
|-----------------------|--------------|-----------------------------------------------------|
| `riding`              | rider        | start session, no location; fan out                 |
| `riding <place>`      | rider        | start session with location_text; fan out           |
| `done`                | rider        | end live session; **no** fan-out (avoid noise)      |
| `who`                 | anyone       | reply listing live sessions in their crew           |
| `where <name>`        | anyone       | reply with that rider's location_text (if live)     |
| `+3h` / `extend`      | rider        | push expires_at out 3 hours                         |
| `name <displayname>`  | anyone       | set display name                                    |
| `mute` / `unmute`     | anyone       | stop/resume receiving fan-out (still a crew member) |
| `help`                | anyone       | command list *(Twilio-required keyword)*            |
| `stop` / `start`      | anyone       | carrier-level opt-out/in *(Twilio handles; honor it)*|
| anything else         | anyone       | short help hint                                     |

Design notes:
- `done` is silent to the crew on purpose. Arrivals are interesting;
  departures are noise.
- `stop` conflicts semantically with "stop riding" — that's why ending a
  ride is `done`. Document this loudly; carriers reserve STOP.

### Fan-out message format

```
🛞 Stiwi is riding at Piedmont Park (til ~9:15pm)
Reply WHO to see everyone out, MUTE to silence.
```

Footer appears on a rider's first-ever fan-out and then at most once per
30 days per recipient (compliance nicety without daily spam).

## 5. Onboarding (MVP-crude, fine)

No self-serve signup. Admin (you) seeds riders via a CLI/SQL script:
phone, name, crew. First inbound message from a known number gets a welcome
reply with the command list. Unknown numbers get a polite "this is a private
beta" reply and are logged.

## 6. Architecture

```
Twilio number
   │  inbound SMS webhook (POST /webhooks/twilio)
   ▼
Service (single small app)          SQLite (WAL)
   │  parse command → mutate state ──► riders / crews / sessions / message_log
   │
   ├─► Twilio REST API: fan-out sends
   └─► expiry sweep (in-process ticker, every minute)
```

- **Stack:** whatever's fastest for you — a single Rust (axum) or
  TypeScript (Hono/Express) service. SQLite is plenty; this is tens of
  writes per day.
- **Hosting:** homelab-friendly (you already run Proxmox + Cloudflare
  Tunnel); Twilio just needs a reachable HTTPS webhook. Fly.io/Railway if
  you'd rather not expose home infra.
- **Webhook security:** validate `X-Twilio-Signature` on every inbound
  request. Reject otherwise.
- **Idempotency:** dedupe on Twilio `MessageSid` (carriers retry webhooks).
- **Expiry:** sweep marks sessions expired; no fan-out on expiry (silent,
  same rationale as `done`).
- **Logging:** append-only message_log of inbound/outbound for debugging;
  prune after 30 days (privacy principle).

## 7. Twilio specifics / gotchas

- **A2P 10DLC registration is unavoidable** for US application SMS, even at
  hobby scale: brand + campaign registration (one-time ~$19–$60, small
  monthly campaign fee), or a **toll-free number with verification** as the
  simpler alternative. Budget lead time — verification can take days.
- Costs otherwise trivial: number ~$1.15/mo, ~$0.008 per SMS segment.
  Keep fan-out messages under 160 GSM-7 chars to stay one segment.
- Group MMS threads (the bot inside an existing group text) are explicitly
  **out of scope** — deliverability and threading are unreliable. The bot is
  a 1:1 contact for each person.
- Honor STOP/START/HELP; Twilio Advanced Opt-Out can auto-handle, but the
  service must also flag opted-out riders to never fan out to them.

## 8. Data model (DDL sketch)

```sql
CREATE TABLE crews  (id TEXT PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE riders (
  id TEXT PRIMARY KEY, phone TEXT UNIQUE NOT NULL,      -- E.164
  display_name TEXT NOT NULL, crew_id TEXT REFERENCES crews(id),
  muted INTEGER DEFAULT 0, opted_out INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE ride_sessions (
  id TEXT PRIMARY KEY, rider_id TEXT REFERENCES riders(id),
  started_at TEXT NOT NULL, expires_at TEXT NOT NULL,
  ended_at TEXT, location_text TEXT
);
CREATE TABLE message_log (
  id INTEGER PRIMARY KEY, direction TEXT, phone TEXT, body TEXT,
  twilio_sid TEXT UNIQUE, created_at TEXT DEFAULT (datetime('now'))
);
```

## 9. Milestones

1. **M0 — echo bot.** Number provisioned, 10DLC/toll-free verification
   done, webhook validates signature and echoes. (Mostly waiting on Twilio.)
2. **M1 — presence.** `riding`/`done`/`who` against SQLite, seeded crew of 2
   (you + test phone). Expiry sweep working.
3. **M2 — crew fan-out.** Full grammar, mute/opt-out handling, dedupe,
   deploy to real host. Onboard the actual crew.
4. **M3 — live with crew for 2+ weeks.** Collect friction notes → feed v1.1
   (PWA + geocoded pins).

## 10. Open questions

- Name/branding (affects the number's vanity potential and HELP text).
- Default expiry: 3h right, or should `riding` ask nothing and `riding 5h`
  override?
- Should `who` also be answerable by *non-crew* friends someday, or is
  crew-only a hard privacy line?
- Quiet hours (no fan-out 11pm–7am?) — skip for MVP, decide from real use.
