import { describe, expect, it, vi } from "vitest";
import {
  bootstrapSearchAfterCursor,
  buildOpenFdaQuery,
  DEFAULT_OPENFDA_PROXY,
  FDA_SKIP_LIMIT,
  openFdaCandidateUrls,
  parseSearchAfterFromLink,
  parseSearchAfterFromResponse,
} from "./openfdaPaging";

describe("parseSearchAfterFromLink", () => {
  it("extracts search_after from a rel=next Link header", () => {
    const header =
      '<https://api.fda.gov/food/enforcement.json?limit=6&sort=report_date:desc&skip=0&search_after=0%3Dtoken>; rel="next"';
    expect(parseSearchAfterFromLink(header)).toBe("0=token");
  });

  it("returns null when Link is missing, skip-only, or has no next relation", () => {
    expect(parseSearchAfterFromLink(null)).toBeNull();
    expect(parseSearchAfterFromLink('<https://api.fda.gov/x>; rel="prev"')).toBeNull();
    expect(
      parseSearchAfterFromLink(
        '<https://api.fda.gov/food/enforcement.json?limit=6&skip=25006&sort=report_date:desc>; rel="next"',
      ),
    ).toBeNull();
  });
});

describe("parseSearchAfterFromResponse", () => {
  it("prefers the exposed X-OpenFDA-Search-After header", () => {
    const res = {
      headers: {
        get: (name: string) => {
          if (name.toLowerCase() === "x-openfda-search-after") return "from-proxy";
          if (name.toLowerCase() === "link") {
            return '<https://api.fda.gov/food/enforcement.json?search_after=from-link>; rel="next"';
          }
          return null;
        },
      },
    } as Response;
    expect(parseSearchAfterFromResponse(res)).toBe("from-proxy");
  });
});

describe("buildOpenFdaQuery", () => {
  it("uses skip under the FDA offset cap", () => {
    const query = buildOpenFdaQuery({ limit: 6, skip: 12, sort: "report_date:desc" });
    expect(query).toContain("skip=12");
    expect(query).not.toContain("search_after");
  });

  it("omits skip when a search_after cursor is present", () => {
    const query = buildOpenFdaQuery({
      limit: 6,
      skip: FDA_SKIP_LIMIT + 6,
      sort: "report_date:desc",
      searchAfter: "0=token",
    });
    expect(query).toContain("search_after=0%3Dtoken");
    expect(query).not.toContain("skip=");
  });
});

describe("openFdaCandidateUrls", () => {
  it("tries the same-origin proxy then api.fda.gov when no worker is configured", () => {
    const urls = openFdaCandidateUrls("enforcement");
    expect(urls[0]).toContain("/api/food/enforcement.json");
    expect(urls).not.toContain(`${DEFAULT_OPENFDA_PROXY}/food/enforcement.json`);
    expect(urls[urls.length - 1]).toBe("https://api.fda.gov/food/enforcement.json");
  });

  it("inserts VITE_OPENFDA_PROXY between the same-origin path and api.fda.gov", () => {
    vi.stubEnv("VITE_OPENFDA_PROXY", DEFAULT_OPENFDA_PROXY);
    const urls = openFdaCandidateUrls("enforcement");
    expect(urls).toContain(`${DEFAULT_OPENFDA_PROXY}/food/enforcement.json`);
    expect(urls[urls.length - 1]).toBe("https://api.fda.gov/food/enforcement.json");
    vi.unstubAllEnvs();
  });
});

describe("bootstrapSearchAfterCursor", () => {
  it("walks from skip=0 using search_after, not skip=25000", async () => {
    const fetchPage = vi.fn(async (query: string) => {
      const token = query.includes("search_after=") ? "second" : "first";
      return {
        ok: true,
        headers: {
          get: (name: string) =>
            name.toLowerCase() === "link"
              ? `<https://api.fda.gov/food/enforcement.json?search_after=${token}>; rel="next"`
              : null,
        },
      } as Response;
    });
    const cursor = await bootstrapSearchAfterCursor({
      skip: 12,
      limit: 6,
      sort: "report_date:desc",
      searchParam: null,
      hopLimit: 6,
      fetchPage,
    });
    expect(cursor).toBe("second");
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage.mock.calls[0][0]).toContain("skip=0");
    expect(fetchPage.mock.calls[0][0]).not.toContain("search_after");
    expect(fetchPage.mock.calls[1][0]).toContain("search_after=first");
    expect(fetchPage.mock.calls[1][0]).not.toContain("skip=");
  });
});
