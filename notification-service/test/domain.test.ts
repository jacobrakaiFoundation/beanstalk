import { describe, expect, it } from "vitest";
import { findNoticeMatch, matchesTerm, normalizeTerm, validateAndNormalizeTerms } from "../src/domain.js";
import { storedNotice } from "./helpers.js";

describe("watchlist matching", () => {
  it("uses exact Unicode word and phrase boundaries", () => {
    expect(matchesTerm("Salmonella may be present", normalizeTerm("SALMONELLA"))).toBe(true);
    expect(matchesTerm("Salmonella may be present", normalizeTerm("salmon"))).toBe(false);
    expect(matchesTerm("cod fillets", normalizeTerm("cod"))).toBe(true);
    expect(matchesTerm("code information", normalizeTerm("cod"))).toBe(false);
    expect(matchesTerm("Crème brûlée cups", normalizeTerm("crème brûlée"))).toBe(true);
  });

  it("returns matched-field evidence without broad negation logic", () => {
    const notice = storedNotice("allergen", "2026-09-13T00:00:00.000Z", "Cookies with undeclared milk");
    notice.summary = "No illnesses have been reported. The label omits milk.";
    expect(findNoticeMatch(notice, ["milk"])).toEqual({ term: "milk", field: "title" });
  });

  it("normalizes, deduplicates, and limits terms", () => {
    expect(validateAndNormalizeTerms(["  MILK ", "milk", "Peanut Butter"])).toEqual(["milk", "peanut butter"]);
    expect(() => validateAndNormalizeTerms(["x"])).toThrow("2 to 80");
    expect(() => validateAndNormalizeTerms(Array.from({ length: 21 }, (_, index) => `term ${index}`))).toThrow(
      "at most 20",
    );
  });
});
