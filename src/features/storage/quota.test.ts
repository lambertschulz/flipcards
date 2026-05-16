import { classifyQuota } from "@/features/storage/quota";
import { describe, expect, it } from "vitest";

describe("classifyQuota", () => {
  it("returns ok below 80 %", () => {
    expect(classifyQuota(79, 100).level).toBe("ok");
  });

  it("returns warning at 80 %", () => {
    expect(classifyQuota(80, 100).level).toBe("warning");
  });

  it("returns warning between 80 % and 95 %", () => {
    expect(classifyQuota(90, 100).level).toBe("warning");
  });

  it("returns critical at 95 %", () => {
    expect(classifyQuota(95, 100).level).toBe("critical");
  });

  it("returns critical above 95 %", () => {
    expect(classifyQuota(99, 100).level).toBe("critical");
  });

  it("returns ok with ratio 0 when quota is unknown", () => {
    expect(classifyQuota(500, 0)).toEqual({ usage: 500, quota: 0, ratio: 0, level: "ok" });
  });
});
