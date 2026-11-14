import { describe, expect, it } from "vitest";
import { companyParams, isDefaultCompanies, shownCompanies } from "@/lib/company-filter";

const all = [1, 2, 3, 4, 5];
const canary = [5];
const show = (sp: { company?: string; hide?: string }) => [...shownCompanies(sp, all, canary)].sort();

describe("company filter", () => {
  it("hides the canary by default", () => {
    expect(show({})).toEqual([1, 2, 3, 4]);
    expect(isDefaultCompanies(shownCompanies({}, all, canary), all, canary)).toBe(true);
  });
  it("shows the canary again with hide=none", () => expect(show({ hide: "none" })).toEqual([1, 2, 3, 4, 5]));
  it("keeps old single-company links working, canary included", () => {
    expect(show({ company: "2" })).toEqual([2]);
    expect(show({ company: "5" })).toEqual([5]);
  });
  it("shows several companies, or all but several", () => {
    expect(show({ company: "1,3" })).toEqual([1, 3]);
    expect(show({ hide: "2,5" })).toEqual([1, 3, 4]);
  });
  it("ignores unknown ids and junk", () => expect(show({ company: "x,9,2" })).toEqual([2]));
  it("writes the shortest params", () => {
    expect(companyParams(new Set([1, 2, 3, 4]), all, canary)).toEqual({ company: undefined, hide: undefined });
    expect(companyParams(new Set(all), all, canary)).toEqual({ company: undefined, hide: "none" });
    expect(companyParams(new Set([2]), all, canary)).toEqual({ company: "2", hide: undefined });
    expect(companyParams(new Set([1, 2, 3]), all, canary)).toEqual({ company: undefined, hide: "4,5" });
    expect(companyParams(new Set(), all, canary)).toEqual({ company: undefined, hide: "1,2,3,4,5" });
  });
  it("round-trips", () => {
    for (const s of [[1], [1, 2], [1, 2, 3, 4, 5], [2, 3, 4, 5], []]) {
      const p = companyParams(new Set(s), all, canary);
      expect(show(p)).toEqual(s);
    }
  });
});
