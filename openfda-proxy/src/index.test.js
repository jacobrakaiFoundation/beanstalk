import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseSearchAfterFromLink, rewriteOpenFdaLinkHeader } from "./index.js";

describe("parseSearchAfterFromLink", () => {
  it("reads search_after from rel=next", () => {
    const link =
      '<https://api.fda.gov/food/enforcement.json?limit=6&search_after=0%3Dtoken>; rel="next"';
    assert.equal(parseSearchAfterFromLink(link), "0=token");
  });

  it("returns null for skip-only next links", () => {
    const link = '<https://api.fda.gov/food/enforcement.json?limit=6&skip=12>; rel="next"';
    assert.equal(parseSearchAfterFromLink(link), null);
  });
});

describe("rewriteOpenFdaLinkHeader", () => {
  it("rewrites the host to the proxy and strips api_key", () => {
    const link =
      '<https://api.fda.gov/food/enforcement.json?limit=6&api_key=secret&search_after=0%3Dtoken>; rel="next"';
    const rewritten = rewriteOpenFdaLinkHeader(link, "https://beanstalk-openfda.example.workers.dev");
    assert.match(rewritten, /^<https:\/\/beanstalk-openfda\.example\.workers\.dev\/food\/enforcement\.json\?/);
    assert.doesNotMatch(rewritten, /api_key/);
    assert.match(rewritten, /search_after=0%3Dtoken/);
    assert.match(rewritten, /rel="next"/);
  });
});
