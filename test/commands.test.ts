import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../src/db/index.js";
import { upsertCrew, upsertRider, findRiderByPhone } from "../src/domain/riders.js";
import { liveSessionFor, liveSessionsInCrew } from "../src/domain/sessions.js";
import { handleInbound } from "../src/sms/commands.js";

const STIWI = "+14045551234";
const RILEY = "+14045550000";
const NAV = "+14045559999";
const STRANGER = "+15005550006";

function seedCrew(): void {
  db.exec("DELETE FROM ride_sessions; DELETE FROM riders; DELETE FROM crews;");
  const crew = upsertCrew("ATL Floaters");
  upsertRider(STIWI, "Stiwi", crew);
  upsertRider(RILEY, "Riley", crew);
  upsertRider(NAV, "Nav", crew);
}

beforeEach(seedCrew);

describe("handleInbound", () => {
  it("welcomes a known rider on first contact, then not again", () => {
    const first = handleInbound(STIWI, "who");
    expect(first.reply).toContain("Welcome to Rollcall");
    const second = handleInbound(STIWI, "who");
    expect(second.reply).not.toContain("Welcome to Rollcall");
  });

  it("rejects unknown numbers with the private-beta reply", () => {
    const res = handleInbound(STRANGER, "riding");
    expect(res.reply).toContain("private Rollcall beta");
    expect(res.fanout).toHaveLength(0);
  });

  it("starts a ride and fans out to the rest of the crew", () => {
    handleInbound(STIWI, "name Stiwi"); // consume the welcome
    const res = handleInbound(STIWI, "riding piedmont park");
    expect(res.reply).toContain("You're live at piedmont park");
    // Riley + Nav, not Stiwi
    expect(res.fanout.map((m) => m.to).sort()).toEqual([RILEY, NAV].sort());
    expect(res.fanout[0]!.body).toContain("Stiwi is riding at piedmont park");
    expect(liveSessionFor(findRiderByPhone(STIWI)!.id)).toBeDefined();
  });

  it("does not fan out on done", () => {
    handleInbound(STIWI, "riding");
    const res = handleInbound(STIWI, "done");
    expect(res.fanout).toHaveLength(0);
    expect(liveSessionFor(findRiderByPhone(STIWI)!.id)).toBeUndefined();
  });

  it("refreshes an existing session instead of duplicating", () => {
    handleInbound(STIWI, "riding here");
    handleInbound(STIWI, "riding there");
    const crewId = findRiderByPhone(STIWI)!.crew_id!;
    const live = liveSessionsInCrew(crewId).filter((s) => s.phone === STIWI);
    expect(live).toHaveLength(1);
    expect(live[0]!.location_text).toBe("there");
  });

  it("shows the footer on first fan-out to a recipient, then omits it", () => {
    const first = handleInbound(STIWI, "riding");
    expect(first.fanout.every((m) => m.body.includes("Reply WHO"))).toBe(true);
    const second = handleInbound(STIWI, "riding again");
    expect(second.fanout.every((m) => m.body.includes("Reply WHO"))).toBe(false);
  });

  it("muted riders are excluded from fan-out", () => {
    handleInbound(RILEY, "mute");
    const res = handleInbound(STIWI, "riding");
    expect(res.fanout.map((m) => m.to)).not.toContain(RILEY);
    expect(res.fanout.map((m) => m.to)).toContain(NAV);
  });

  it("who lists live sessions in the crew", () => {
    handleInbound(STIWI, "riding piedmont");
    const res = handleInbound(RILEY, "who");
    expect(res.reply).toContain("Stiwi");
    expect(res.reply).toContain("piedmont");
  });

  it("where reports a live rider's spot", () => {
    handleInbound(STIWI, "riding the pump track");
    const res = handleInbound(RILEY, "where Stiwi");
    expect(res.reply).toContain("the pump track");
  });

  it("where handles a rider who isn't out", () => {
    const res = handleInbound(RILEY, "where Stiwi");
    expect(res.reply).toContain("isn't out");
  });

  it("stop flags the rider opted-out and stays silent", () => {
    const res = handleInbound(RILEY, "stop");
    expect(res.reply).toBeNull();
    expect(findRiderByPhone(RILEY)!.opted_out).toBe(1);
    // Opted-out riders never receive fan-out.
    const ride = handleInbound(STIWI, "riding");
    expect(ride.fanout.map((m) => m.to)).not.toContain(RILEY);
  });
});
