import { ttiLabSecondsFromRawAudit } from "@/lib/labTtiFromAudit";

describe("ttiLabSecondsFromRawAudit", () => {
  it("reads interactive audit ms and returns seconds", () => {
    const raw = { audits: { interactive: { numericValue: 15200 } } };
    expect(ttiLabSecondsFromRawAudit(raw)).toBe(15.2);
  });

  it("returns null when missing or invalid", () => {
    expect(ttiLabSecondsFromRawAudit(null)).toBeNull();
    expect(ttiLabSecondsFromRawAudit({})).toBeNull();
    expect(ttiLabSecondsFromRawAudit({ audits: { interactive: {} } })).toBeNull();
  });
});
