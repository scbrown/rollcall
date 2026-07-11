# Vision — Ride Presence for PEV Riders

*Working name: TBD (candidates: Rollcall, Beacon, Floatline)*

## The problem

PEV riders (Onewheel, EUC, esk8, e-scooter) coordinate rides through ad-hoc
text threads. "Anyone riding today?" gets asked into the void; spontaneous
rides go un-joined because nobody knew they were happening. Existing options
don't fit:

- **Group texts** — noisy, no state. You can't glance at anything and see
  who's out *right now*.
- **The Onewheel app's group rides** — locked to Future Motion hardware,
  requires the app, and burned community trust with its location-services
  requirements.
- **VESC community apps** — telemetry-focused, or gamified (map/territory
  claiming). Fun, but heavyweight for the core need.
- **Motorcycle apps (REVER, Group Ride, etc.)** — full route
  planning/tracking suites. Way more than a crew of friends needs.

## The idea

**A presence beacon, not a tracker.** One bit of state per rider — *riding /
not riding* — with an optional location, broadcast to your crew. Think
Discord status for wheels.

When you head out, you flip your status on (or it flips itself — see below).
Your crew gets a ping: *"Stiwi is riding at Piedmont Park."* Anyone who wants
in shows up. Status auto-expires, so it's never stale.

## Why SMS-first is the wedge

The crews that need this are already living in SMS threads, and half of any
crew will never install an app. So the phone number **is** the product:

- Text `riding piedmont` → you're live, crew gets pinged.
- A friend replies `where` → gets the pin.
- Text `done` (or just let it time out) → you're off the board.

Zero install, zero onboarding beyond "save this number." The app/PWA comes
later as a nicer skin over the same API — a map of who's out, one-tap go-live
— but it's never required.

## The long-term hook: zero-effort presence

Most riders run VESC or BLE-telemetry hardware. Once a companion (Float
Control, custom BLE bridge, phone motion) can tell the service "the board is
moving," presence becomes automatic. Nobody has to remember to announce
anything — you just ride, and your crew knows. No text thread can compete
with that.

## Principles

1. **Presence, not surveillance.** Ephemeral status and a coarse, opt-in
   location pin. No breadcrumb trails, no history feed by default.
2. **Crew-scoped.** Your status goes to people you chose, full stop. No
   public map of strangers.
3. **Stale state is death.** Everything expires. A beacon you can't trust is
   worse than no beacon.
4. **Meet riders where they are.** SMS first, PWA second, native app maybe
   never.

## Roadmap sketch

- **MVP** — SMS-only presence + crew fan-out (see spec).
- **v1.1** — PWA: live "who's riding" view, one-tap go-live, map pins.
- **v2** — Auto-start via telemetry (VESC/BLE/phone motion); scheduled
  rides ("riding at 6pm, who's in?"); multiple crews.
- **Someday** — the fun stuff (streaks, group ride stats, maybe territory
  games) — only once the beacon is rock solid.
