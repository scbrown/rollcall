# 🛞 Rollcall

**A presence beacon for PEV crews, not a tracker.** Text one number to go
"live"; your crew gets a ping. Friends ask who's out and where. Status
auto-expires, so it's never stale. Think Discord status for wheels.

Onewheel, EUC, esk8, e-scooter riders coordinate through noisy group texts
where "anyone riding today?" gets asked into the void. Rollcall is one bit of
state per rider — *riding / not riding* — broadcast to the people you chose.
SMS-first, because half of any crew will never install an app.

> This repo is the **MVP**: SMS-only presence + crew fan-out. No PWA, no
> telemetry, one crew per rider. See [`docs/vision.md`](docs/vision.md) for
> where it's headed and [`docs/mvp-spec.md`](docs/mvp-spec.md) for the full
> spec this implements.

## How it feels

```
You → RIDING piedmont park
Rollcall → You're live at piedmont park til ~9:15pm. Crew notified.

  (meanwhile, your crew gets:)
  🛞 Stiwi is riding at piedmont park (til ~9:15pm)
  Reply WHO to see everyone out, MUTE to silence.

Friend → WHERE stiwi
Rollcall → Stiwi is at piedmont park (til ~9:15pm).

You → DONE      (or just let it expire — crew isn't pinged either way)
Rollcall → You're off the board. Ride safe. 🛞
```

## SMS commands

| Text                 | Who    | Effect                                             |
|----------------------|--------|----------------------------------------------------|
| `riding`             | rider  | Go live, no location; fan out to crew              |
| `riding <place>`     | rider  | Go live with a location; fan out                   |
| `done`               | rider  | End your ride (crew **not** pinged — departures are noise) |
| `who`                | anyone | List who's out in your crew                        |
| `where <name>`       | anyone | Get that rider's spot, if they're live             |
| `+3h` / `extend`     | rider  | Push your expiry out                               |
| `name <displayname>` | anyone | Set your display name                              |
| `mute` / `unmute`    | anyone | Stop / resume receiving fan-out (still a member)   |
| `help`               | anyone | Command list                                       |
| `stop` / `start`     | anyone | Carrier opt-out / opt-in (honored)                 |

> ⚠️ Ending a ride is **`done`**, not `stop`. Carriers reserve `STOP` for
> opting out of all messages — texting it unsubscribes you entirely.

## Architecture

```
Twilio number
   │  inbound SMS webhook (POST /webhooks/twilio)
   ▼
Rollcall service (Hono, single process)      SQLite (WAL)
   │  validate signature → parse → mutate ──► crews / riders / ride_sessions / message_log
   ├─► Twilio REST API: crew fan-out
   └─► expiry sweep (in-process, every minute)
```

- **Stack:** TypeScript + [Hono](https://hono.dev) on Node ≥20, `better-sqlite3`,
  the official `twilio` SDK. SQLite is plenty — this is tens of writes a day.
- **Security:** every inbound request's `X-Twilio-Signature` is validated;
  otherwise rejected with 403.
- **Idempotency:** inbound messages are deduped on Twilio's `MessageSid`
  (carriers retry webhooks).
- **Expiry:** a one-minute sweep marks lapsed sessions ended — silently, no
  fan-out, same rationale as `done`.
- **Privacy:** the `message_log` is append-only for debugging and pruned after
  30 days.

## Project layout

```
src/
  index.ts            server + sweep bootstrap
  config.ts           env-driven config (one place, no scattered process.env)
  db/
    schema.sql        DDL
    index.ts          shared WAL connection + time helpers
    migrate.ts        `npm run migrate`
  domain/             state + business logic (no HTTP/Twilio here)
    riders.ts  sessions.ts  messages.ts  types.ts
  sms/
    parse.ts          text → Command
    commands.ts       Command → reply + fan-out (pure, unit-tested)
    format.ts         all outbound copy
  twilio/
    validate.ts       X-Twilio-Signature check
    client.ts         REST send (+ DRY_RUN console mode)
  routes/webhook.ts   POST /webhooks/twilio
  seed.ts             `npm run seed` — admin-seeds crews/riders from JSON
test/                 vitest: parser + command handler
docs/                 vision.md, mvp-spec.md
```

## Getting started

Requires Node ≥ 20.

```bash
npm install
cp .env.example .env          # fill in Twilio creds (or set DRY_RUN=true)
npm run migrate               # create the SQLite database
```

### Seed your crew

There's no self-serve signup in the MVP — the admin seeds riders. Copy the
example and edit it:

```bash
cp seed.example.json seed.json   # add your riders (phones must be E.164)
npm run seed                     # idempotent; safe to re-run as the crew grows
```

### Run it

```bash
npm run dev      # tsx watch, reloads on change
# or
npm start        # one-shot
```

The service listens on `PORT` (default 8080) with:
- `POST /webhooks/twilio` — point your Twilio number's inbound SMS webhook here
- `GET /health` — liveness check

### Try it without Twilio (DRY_RUN)

Set `DRY_RUN=true` and signature validation is skipped and outbound SMS is
printed to the console instead of sent — so you can exercise the whole grammar
with `curl`. **Note:** send the `From` value with `--data-urlencode` so the
leading `+` isn't decoded as a space.

```bash
DRY_RUN=true npm start

curl -X POST localhost:8080/webhooks/twilio \
  --data-urlencode "From=+14045551234" \
  --data-urlencode "Body=riding piedmont park" \
  --data-urlencode "MessageSid=SM_test_1"
# → TwiML reply; the crew fan-out prints as [DRY_RUN SMS] lines
```

### Test

```bash
npm test          # vitest: parser + command handler against an in-memory DB
npm run typecheck
```

## Configuration

All via environment variables (see [`.env.example`](.env.example)):

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `8080` | HTTP port |
| `DATABASE_PATH` | `./data/rollcall.db` | SQLite file (`:memory:` for tests) |
| `TWILIO_ACCOUNT_SID` | — | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | — | Used to validate inbound signatures |
| `TWILIO_FROM_NUMBER` | — | The Twilio number, E.164 |
| `PUBLIC_WEBHOOK_URL` | — | Exact webhook URL Twilio calls (signature is hashed over it) |
| `DRY_RUN` | `false` | Skip signature checks + real sends; log instead |
| `DEFAULT_EXPIRY_HOURS` | `3` | Ride session lifetime |
| `SWEEP_INTERVAL_SECONDS` | `60` | Expiry sweep cadence |
| `LOG_RETENTION_DAYS` | `30` | message_log prune horizon |

## Deploying

Rollcall just needs a reachable HTTPS webhook and a writable disk for SQLite.

- **Homelab** (Proxmox + Cloudflare Tunnel): run the process, point the Tunnel
  at `PORT`, set `PUBLIC_WEBHOOK_URL` to the public hostname.
- **Fly.io / Railway**: deploy the Node process with a persistent volume mounted
  where `DATABASE_PATH` points.

Set `PUBLIC_WEBHOOK_URL` to exactly what's configured in the Twilio console —
signature validation hashes that URL, so it must match byte-for-byte.

### Twilio setup (the slow part)

A2P 10DLC registration is **unavoidable** for US application SMS, even at hobby
scale (brand + campaign, one-time ~$19–$60 plus a small monthly fee), or a
**toll-free number with verification** as the simpler alternative. Budget lead
time — verification can take days. Costs otherwise are trivial: number
~$1.15/mo, ~$0.008 per SMS segment. Fan-out copy is kept under 160 GSM-7 chars
to stay one segment. Honor `STOP`/`START`/`HELP`; the service also flags
opted-out riders so it never fans out to them.

## Roadmap

- **MVP (this repo)** — SMS-only presence + crew fan-out.
- **v1.1** — PWA: live "who's riding" view, one-tap go-live, geocoded map pins
  (the `lat`/`lng` columns are already there, unused).
- **v2** — auto-start via telemetry (VESC / BLE / phone motion), scheduled
  rides, multiple crews.

## Principles

1. **Presence, not surveillance.** Ephemeral status, coarse opt-in location. No
   breadcrumb trails.
2. **Crew-scoped.** Your status goes only to people you chose.
3. **Stale state is death.** Everything expires.
4. **Meet riders where they are.** SMS first, PWA second, native maybe never.
