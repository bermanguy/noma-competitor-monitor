import { describe, expect, it } from "vitest";
import { isRunHour } from "../src/pipeline/schedule";

describe("schedule", () => {
  it("runs at 09:00 Israel time in winter and in summer", () => {
    expect(isRunHour(new Date("2026-11-12T07:00:00Z"), new Date("2026-11-12T04:00:00Z"))).toBe(true); // 09:00 IST
    expect(isRunHour(new Date("2026-07-12T06:00:00Z"), new Date("2026-07-12T03:00:00Z"))).toBe(true); // 09:00 IDT
  });
  it("skips the hours between", () => {
    expect(isRunHour(new Date("2026-11-12T08:00:00Z"), new Date("2026-11-12T07:00:00Z"))).toBe(false); // 10:00 IST
  });
  it("catches up when runs were missed", () => {
    expect(isRunHour(new Date("2026-11-12T08:00:00Z"), new Date("2026-11-12T04:00:00Z"))).toBe(true);
    expect(isRunHour(new Date("2026-11-12T08:00:00Z"), null)).toBe(true);
  });
});
