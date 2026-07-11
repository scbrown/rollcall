import { describe, expect, it } from "vitest";
import { parseCommand } from "../src/sms/parse.js";

describe("parseCommand", () => {
  it("is case-insensitive on the keyword", () => {
    expect(parseCommand("RIDING")).toEqual({ kind: "riding", location: null });
    expect(parseCommand("Riding")).toEqual({ kind: "riding", location: null });
  });

  it("captures a free-text location after riding", () => {
    expect(parseCommand("riding piedmont park")).toEqual({
      kind: "riding",
      location: "piedmont park",
    });
  });

  it("preserves location casing but trims", () => {
    expect(parseCommand("  riding   Piedmont Park  ")).toEqual({
      kind: "riding",
      location: "Piedmont Park",
    });
  });

  it("parses done and who", () => {
    expect(parseCommand("done")).toEqual({ kind: "done" });
    expect(parseCommand("who")).toEqual({ kind: "who" });
  });

  it("parses where with a name", () => {
    expect(parseCommand("where Stiwi")).toEqual({ kind: "where", name: "Stiwi" });
  });

  it("parses name assignment", () => {
    expect(parseCommand("name Stiwi")).toEqual({ kind: "name", displayName: "Stiwi" });
  });

  it("parses mute/unmute", () => {
    expect(parseCommand("mute")).toEqual({ kind: "mute" });
    expect(parseCommand("unmute")).toEqual({ kind: "unmute" });
  });

  it("parses extend variants", () => {
    expect(parseCommand("extend")).toEqual({ kind: "extend", hours: 3 });
    expect(parseCommand("+3h")).toEqual({ kind: "extend", hours: 3 });
    expect(parseCommand("+2")).toEqual({ kind: "extend", hours: 2 });
    expect(parseCommand("+90m")).toEqual({ kind: "extend", hours: 1.5 });
  });

  it("treats STOP/START as carrier keywords", () => {
    expect(parseCommand("stop")).toEqual({ kind: "stop" });
    expect(parseCommand("UNSUBSCRIBE")).toEqual({ kind: "stop" });
    expect(parseCommand("start")).toEqual({ kind: "start" });
  });

  it("parses help", () => {
    expect(parseCommand("help")).toEqual({ kind: "help" });
  });

  it("falls back to unknown for gibberish", () => {
    expect(parseCommand("wat")).toEqual({ kind: "unknown" });
    expect(parseCommand("")).toEqual({ kind: "unknown" });
  });
});
