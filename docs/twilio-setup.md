# Twilio setup

Everything you need to get a real number talking to Rollcall. The **verification
step is the slow part** (days, sometimes), so start it first and build the rest
while you wait.

## TL;DR checklist

- [ ] Create a Twilio account, add a little balance ($20 is plenty to start)
- [ ] **Pick a number type** → toll-free (simpler) *or* a local 10DLC number
- [ ] Buy the number
- [ ] **Submit verification** (toll-free verification *or* 10DLC brand + campaign) ← the wait
- [ ] Deploy Rollcall somewhere with a public HTTPS URL
- [ ] Point the number's inbound webhook at `POST …/webhooks/twilio`
- [ ] Put `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `PUBLIC_WEBHOOK_URL` in the service's env/secrets
- [ ] Send yourself `help` and watch it reply

## 1. Account

Sign up at [twilio.com](https://www.twilio.com/try-twilio), verify your own
phone/email, and add a small balance. Note two values from the Console
dashboard — you'll need them later:

- **Account SID** (`AC…`)
- **Auth Token** (click to reveal)

These become `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`. The auth token is
what Rollcall uses to validate the `X-Twilio-Signature` on every inbound
request, so it has to be exact.

## 2. Choose a number type

US application-to-person SMS (which this is — an app sending texts) **must** be
registered. There's no hobby exemption. You have two paths:

| | **Toll-free** (recommended to start) | **10DLC** (local number) |
|---|---|---|
| Number looks like | `+1 (833) …` | a local area code, e.g. `+1 (404) …` |
| Registration | Toll-free **verification** (one form) | **Brand + campaign** registration |
| Effort | Lower — a single form | Higher — brand, then campaign, then link the number |
| Cost | number ~$2/mo; verification free | number ~$1.15/mo; one-time ~$19–$60 + small monthly campaign fee |
| Throughput | Plenty for a crew | Plenty for a crew |
| Lead time | Hours to a few days | Similar, sometimes longer |

For a friends-and-family beacon, **toll-free is the path of least resistance**.
Choose 10DLC only if you specifically want a local-looking number.

## 3. Buy the number

Console → **Phone Numbers → Manage → Buy a number**. Filter by **SMS**
capability (you don't need Voice/MMS). For toll-free, pick a `833/844/855/…`
number; for 10DLC, pick a local one. This is your `TWILIO_FROM_NUMBER` (in
E.164, e.g. `+18335551234`).

## 4. Verify / register  ← start this early

**Toll-free verification** — Console → **Messaging → Regulatory Compliance →
Toll-Free Verification** (or you'll be prompted after buying). You'll describe:

- **Business/use case:** personal/community use, "presence notifications for a
  small group of friends who ride personal electric vehicles."
- **Sample messages:** paste real fan-out copy, e.g.
  `🛞 Stiwi is riding at Piedmont Park (til ~9:15pm). Reply WHO to see everyone out, MUTE to silence.`
- **Opt-in description:** how people consent. For a private beta: "Recipients
  are friends who asked to be added and are seeded manually by the operator;
  each is told to text STOP to opt out." Be honest — this is the part reviewers
  read closely.
- **Opt-out:** "Users text STOP; we honor it and never message again."

**10DLC** — register a **Brand** (your identity) then a **Campaign** (this use
case, "low volume / notifications"), then associate your number with the
campaign. Same content questions as above.

Either way: submit, then wait. You can keep going below and finish once it's
approved.

## 5. Deploy Rollcall (get a public HTTPS URL)

Twilio needs a public HTTPS endpoint to deliver inbound SMS to. Any of:

- **Fly.io** — `fly deploy` with the included [`fly.toml`](../fly.toml). URL is
  `https://<app>.fly.dev`.
- **Homelab** — run the container behind a Cloudflare Tunnel; URL is your
  tunnel hostname.
- **Local dev** — `npx ngrok http 8080` gives you a temporary
  `https://….ngrok.app` URL for testing before you deploy for real.

Your webhook path is **`/webhooks/twilio`**, so the full URL is e.g.
`https://rollcall.fly.dev/webhooks/twilio`. That exact string is
`PUBLIC_WEBHOOK_URL`.

> ⚠️ Signature validation hashes this URL. It must match what you enter in the
> Twilio console **byte-for-byte** — same scheme, host, and path, no trailing
> slash mismatch — or every inbound request will 403.

## 6. Point the number at the webhook

Console → **Phone Numbers → Manage → Active numbers → (your number) →
Messaging**. Under **"A message comes in"**:

- Set to **Webhook**
- URL: `https://<your-host>/webhooks/twilio`
- Method: **HTTP POST**

Save.

## 7. Opt-out handling (STOP / START / HELP)

Twilio's **Advanced Opt-Out** can auto-reply to `STOP`/`START`/`HELP` at the
carrier level — leave it on. Rollcall *also* handles these itself: `stop` flags
the rider `opted_out` so fan-out never reaches them again, `start` clears it,
and `help` returns the command list. The two layers are complementary; you want
both.

Reminder for your crew: **ending a ride is `done`, not `stop`.** `STOP`
unsubscribes them from everything.

## 8. Set the secrets and go

Wherever Rollcall runs, set these four (see [`.env.example`](../.env.example)
for the full list):

```
TWILIO_ACCOUNT_SID=AC…
TWILIO_AUTH_TOKEN=…
TWILIO_FROM_NUMBER=+1…
PUBLIC_WEBHOOK_URL=https://<your-host>/webhooks/twilio
```

On Fly:

```bash
fly secrets set \
  TWILIO_ACCOUNT_SID=AC… \
  TWILIO_AUTH_TOKEN=… \
  TWILIO_FROM_NUMBER=+18335551234 \
  PUBLIC_WEBHOOK_URL=https://rollcall.fly.dev/webhooks/twilio
```

Seed yourself and a test number ([`seed.example.json`](../seed.example.json) →
`seed.json`, then `npm run seed` — or `fly ssh console` and run it there), then
text `help` to your Twilio number. You should get the command list back. Text
`riding somewhere` from one seeded phone and the other should get the ping.

## Costs, roughly

- Number: ~$1.15/mo (10DLC) or ~$2/mo (toll-free)
- 10DLC one-time registration: ~$19–$60, plus a small monthly campaign fee
- Per message: ~$0.008 per SMS segment. Fan-out copy is kept under 160 GSM-7
  chars so each send is a single segment. A crew of 10 riding a few times a
  week is pennies a month.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Every inbound request 403s | `PUBLIC_WEBHOOK_URL` ≠ the console URL (or auth token wrong). They must match exactly. |
| Inbound texts do nothing, no 403 | Webhook not set on the number, or set to the wrong method (must be POST). |
| Replies work but fan-out doesn't send | Number not yet verified/registered, or recipient texted STOP. Check the Twilio Messaging logs. |
| "From a known number" gets the private-beta reply | That phone isn't seeded, or seeded in E.164 with the wrong digits. |
| Want to see what Twilio sent/received | Console → **Monitor → Logs → Messaging**. |
