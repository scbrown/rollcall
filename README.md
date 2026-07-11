<div align="center">

<img src="docs/assets/logo.svg" alt="Rollcall — presence for wheels" width="620">

### Text one number. Your crew knows you're out. That's the whole thing.

_A presence beacon for PEV riders — **not** a tracker._

<br>

![status](https://img.shields.io/badge/status-MVP-5eead4?style=flat-square)
![stack](https://img.shields.io/badge/TypeScript-Hono-38bdf8?style=flat-square)
![storage](https://img.shields.io/badge/SQLite-WAL-0ea5e9?style=flat-square)
![sms](https://img.shields.io/badge/SMS-Twilio-64748b?style=flat-square)
![tests](https://img.shields.io/badge/tests-22%20passing-22c55e?style=flat-square)

</div>

---

Onewheel, EUC, esk8, and scooter crews coordinate through noisy group texts
where _"anyone riding today?"_ gets asked into the void and spontaneous rides
go un-joined because nobody knew. Rollcall is **one bit of state per rider** —
_riding / not riding_ — broadcast only to the people you chose. Think Discord
status, for wheels.

You flip your status on by texting a number. Your crew gets a ping. Anyone who
wants in shows up. Status **auto-expires**, so the board is never stale. No app
to install — half of any crew never would — the phone number _is_ the product.

```
  You  →  RIDING piedmont park
  🛞   →  You're live at piedmont park til ~9:15pm. Crew notified.

        …meanwhile, your crew gets:
        ┌─────────────────────────────────────────────┐
        │ 🛞 Stiwi is riding at piedmont park          │
        │    (til ~9:15pm)                             │
        │ Reply WHO to see everyone out, MUTE to hush. │
        └─────────────────────────────────────────────┘

  Riri →  WHERE stiwi
  🛞   →  Stiwi is at piedmont park (til ~9:15pm).

  You  →  DONE            (or just let it expire — crew isn't pinged either way)
  🛞   →  You're off the board. Ride safe. 🛞
```

## ✨ What it does

- 📟 **Zero-install presence** — text `riding`, your crew gets an SMS. That's onboarding.
- 📍 **Optional spot, not a trail** — drop `riding piedmont park`; friends text `where` for the pin. No breadcrumbs, no history feed.
- ⏳ **Never stale** — every session auto-expires (default 3h, `+3h` to extend). A beacon you can't trust is worse than none.
- 🤫 **Departures are silent** — `done` and expiry never ping the crew. Arrivals are interesting; leaving is noise.
- 👥 **Crew-scoped, full stop** — your status goes only to people you chose. No public map of strangers.
- 🔕 **Mute without leaving** — `mute` stops pings but keeps you a member; `unmute` any time.
- 🔒 **Verified inbound** — every webhook's `X-Twilio-Signature` is validated or rejected.
- ♻️ **Carrier-proof** — duplicate webhooks deduped on `MessageSid`; `STOP`/`START`/`HELP` honored.
- 🧪 **Runs with no Twilio** — `DRY_RUN` mode logs SMS to the console so you can drive the whole grammar with `curl`.

## 💬 The grammar

Keywords are case-insensitive; the first word is the command.

| Text                 | Who    | Effect                                                     |
|----------------------|--------|------------------------------------------------------------|
| `riding`             | rider  | Go live, no location; fan out to crew                      |
| `riding <place>`     | rider  | Go live with a location; fan out                           |
| `done`               | rider  | End your ride — crew **not** pinged                        |
| `who`                | anyone | List who's out in your crew                                |
| `where <name>`       | anyone | Get that rider's spot, if they're live                     |
| `+3h` / `extend`     | rider  | Push your expiry out                                       |
| `name <displayname>` | anyone | Set your display name                                      |
| `mute` / `unmute`    | anyone | Stop / resume receiving fan-out (still a member)           |
| `help`               | anyone | Command list                                               |
| `stop` / `start`     | anyone | Carrier opt-out / opt-in (honored)                         |

> [!WARNING]
> Ending a ride is **`done`**, not `stop`. Carriers reserve `STOP` for opting
> out of _all_ messages — texting it unsubscribes you entirely.

## 🏗️ Architecture

```
Twilio number
   │  inbound SMS webhook (POST /webhooks/twilio)
   ▼
Rollcall service (Hono, single process)      SQLite (WAL)
   │  validate signature → parse → mutate ──► crews / riders / ride_sessions / message_log
   ├─► Twilio REST API: crew fan-out
   └─► expiry sweep (in-process, every minute)
```

TypeScript + [Hono](https://hono.dev) on Node ≥20, `better-sqlite3`, the
official `twilio` SDK. SQLite is plenty — this is tens of writes a day. The
domain layer carries no HTTP or Twilio concerns, so the command handler is
unit-tested against an in-memory database.

<details>
<summary>📂 Project layout</summary>

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
docs/                 vision.md, mvp-spec.md, assets/
```

</details>

## 🚀 Getting started

Requires Node ≥ 20.

```bash
npm install
cp .env.example .env          # fill in Twilio creds (or set DRY_RUN=true)
npm run migrate               # create the SQLite database
```

**Seed your crew.** No self-serve signup in the MVP — the admin seeds riders:

```bash
cp seed.example.json seed.json   # add your riders (phones must be E.164)
npm run seed                     # idempotent; safe to re-run as the crew grows
```

**Run it.**

```bash
npm run dev      # tsx watch, reloads on change
# or
npm start
```

The service listens on `PORT` (default 8080):
- `POST /webhooks/twilio` — point your Twilio number's inbound SMS webhook here
- `GET /health` — liveness check

### 🧪 Try it without Twilio

Set `DRY_RUN=true`: signature checks are skipped and outbound SMS is printed to
the console instead of sent — so you can exercise the whole grammar with `curl`.

> [!NOTE]
> Send `From` with `--data-urlencode` so the leading `+` isn't decoded as a space.

```bash
DRY_RUN=true npm start

curl -X POST localhost:8080/webhooks/twilio \
  --data-urlencode "From=+14045551234" \
  --data-urlencode "Body=riding piedmont park" \
  --data-urlencode "MessageSid=SM_test_1"
# → TwiML reply; the crew fan-out prints as [DRY_RUN SMS] lines
```

### ✅ Test

```bash
npm test          # vitest: parser + command handler against an in-memory DB
npm run typecheck
```

## ⚙️ Configuration

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

## 🌐 Deploying

Rollcall just needs a reachable HTTPS webhook and a writable disk for SQLite.

- **Homelab** (Proxmox + Cloudflare Tunnel): run the process, point the Tunnel at `PORT`, set `PUBLIC_WEBHOOK_URL` to the public hostname.
- **Fly.io / Railway**: deploy the Node process with a persistent volume mounted where `DATABASE_PATH` points.

Set `PUBLIC_WEBHOOK_URL` to exactly what's in the Twilio console — signature
validation hashes that URL, so it must match byte-for-byte.

> [!IMPORTANT]
> **Twilio setup is the slow part.** A2P 10DLC registration is unavoidable for
> US application SMS even at hobby scale (brand + campaign, one-time ~$19–$60
> plus a small monthly fee), or a **toll-free number with verification** as the
> simpler alternative. Verification can take days — budget lead time. Costs
> otherwise are trivial: number ~$1.15/mo, ~$0.008 per SMS segment. Fan-out copy
> stays under 160 GSM-7 chars to bill as one segment.

## 🗺️ Roadmap

- **MVP (this repo)** — SMS-only presence + crew fan-out.
- **v1.1** — PWA: live "who's riding" view, one-tap go-live, geocoded map pins _(the `lat`/`lng` columns are already there, waiting)_.
- **v2** — auto-start via telemetry (VESC / BLE / phone motion), scheduled rides, multiple crews.
- **Someday** — the fun stuff (streaks, group-ride stats) — only once the beacon is rock solid.

## 🧭 Principles

1. **Presence, not surveillance.** Ephemeral status, coarse opt-in location. No breadcrumb trails.
2. **Crew-scoped.** Your status goes only to people you chose.
3. **Stale state is death.** Everything expires.
4. **Meet riders where they are.** SMS first, PWA second, native maybe never.

---

<div align="center">

📖 [Vision](docs/vision.md) &nbsp;·&nbsp; [MVP spec](docs/mvp-spec.md) &nbsp;·&nbsp; [Contributing](CONTRIBUTING.md)

<sub>🛞 Ride safe.</sub>

</div>
