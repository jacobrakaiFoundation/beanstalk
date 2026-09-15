import { describe, expect, it } from "vitest";
import indexHtml from "../../index.html?raw";
import aboutHtml from "../../public/about.html?raw";
import privacyHtml from "../../public/privacy.html?raw";
import robotsTxt from "../../public/robots.txt?raw";
import sitemapXml from "../../public/sitemap.xml?raw";
import supportHtml from "../../public/support.html?raw";
import viteConfig from "../../vite.config.ts?raw";

const SITE = "https://jacobrakaifoundation.github.io/beanstalk";

function attr(html: string, tag: "meta" | "link", key: string, value: string, attrName: "content" | "href"): string {
  const pattern = new RegExp(
    `<${tag}[^>]*${key}="${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*${attrName}="([^"]+)"`,
    "i",
  );
  const match = html.match(pattern);
  if (match) return match[1];
  const reverse = new RegExp(
    `<${tag}[^>]*${attrName}="([^"]+)"[^>]*${key}="${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`,
    "i",
  );
  const reverseMatch = html.match(reverse);
  if (!reverseMatch) {
    throw new Error(`missing <${tag} ${key}="${value}">`);
  }
  return reverseMatch[1];
}

function jsonLd(html: string): Record<string, unknown> {
  const match = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
  if (!match) {
    throw new Error("missing JSON-LD");
  }
  return JSON.parse(match[1]) as Record<string, unknown>;
}

describe("index.html discovery", () => {
  it("names FDA and USDA FSIS in title, keywords, and social tags", () => {
    expect(indexHtml).toContain("<title>Beanstalk — FDA and USDA FSIS food recall search</title>");
    expect(attr(indexHtml, "meta", "name", "keywords", "content")).toMatch(/USDA FSIS/);
    expect(attr(indexHtml, "meta", "name", "description", "content")).toMatch(/USDA FSIS/);
    expect(attr(indexHtml, "meta", "property", "og:title", "content")).toMatch(/USDA FSIS/);
    expect(attr(indexHtml, "link", "rel", "canonical", "href")).toBe(`${SITE}/`);
    expect(attr(indexHtml, "meta", "property", "og:image:alt", "content")).toMatch(/source badges/);
  });

  it("exposes WebApplication JSON-LD with topic keywords", () => {
    const data = jsonLd(indexHtml);
    expect(data["@type"]).toBe("WebApplication");
    expect(data.url).toBe(`${SITE}/`);
    expect(data.keywords).toEqual(expect.arrayContaining(["FDA", "USDA FSIS", "openFDA", "food recall"]));
    const creator = data.creator as Record<string, unknown>;
    expect(creator.name).toBe("JACOBRAKAI FOUNDATION");
    expect(creator.taxID).toBe("33-3382083");
  });

  it("keeps noscript topics and official source links for crawlers without JS", () => {
    expect(indexHtml).toMatch(/<noscript>[\s\S]*Topics:[\s\S]*USDA FSIS/);
    expect(indexHtml).toContain("https://www.fsis.usda.gov/recalls");
    expect(indexHtml).toContain("%BASE_URL%about.html");
  });
});

describe("about.html discovery", () => {
  it("shows topic tags people can scan", () => {
    expect(aboutHtml).toMatch(/<ul class="topics" aria-label="Topics">/);
    expect(aboutHtml).toContain("<li>FDA food recalls</li>");
    expect(aboutHtml).toContain("<li>USDA FSIS</li>");
    expect(aboutHtml).toContain("<li>openFDA</li>");
    expect(aboutHtml).toContain("<li>food safety</li>");
    expect(aboutHtml).toContain("<li>meat poultry egg recall</li>");
    expect(aboutHtml).toContain("<li>public health</li>");
  });

  it("mentions USDA FSIS in copy, keywords, and AboutPage JSON-LD", () => {
    expect(aboutHtml).toContain("Search FDA openFDA and USDA FSIS food recall records");
    expect(attr(aboutHtml, "meta", "name", "keywords", "content")).toMatch(/USDA FSIS/);
    expect(attr(aboutHtml, "link", "rel", "canonical", "href")).toBe(`${SITE}/about.html`);
    const data = jsonLd(aboutHtml);
    expect(data["@type"]).toBe("AboutPage");
    expect(data.keywords).toEqual(expect.arrayContaining(["FDA", "USDA FSIS", "openFDA"]));
  });
});

describe("privacy and support discovery", () => {
  it("gives privacy a canonical URL and WebPage JSON-LD", () => {
    expect(attr(privacyHtml, "link", "rel", "canonical", "href")).toBe(`${SITE}/privacy.html`);
    expect(attr(privacyHtml, "meta", "property", "og:url", "content")).toBe(`${SITE}/privacy.html`);
    expect(attr(privacyHtml, "meta", "name", "twitter:image:alt", "content")).toMatch(/source badges/);
    expect(jsonLd(privacyHtml)["@type"]).toBe("WebPage");
  });

  it("gives support a canonical URL, FSIS source link, and WebPage JSON-LD", () => {
    expect(attr(supportHtml, "link", "rel", "canonical", "href")).toBe(`${SITE}/support.html`);
    expect(attr(supportHtml, "meta", "name", "twitter:image:alt", "content")).toMatch(/source badges/);
    expect(supportHtml).toContain("https://www.fsis.usda.gov/recalls");
    expect(jsonLd(supportHtml)["@type"]).toBe("WebPage");
  });
});

describe("sitemap, robots, and PWA listing", () => {
  it("lists the public HTML pages in sitemap.xml", () => {
    expect(sitemapXml).toContain(`${SITE}/`);
    expect(sitemapXml).toContain(`${SITE}/about.html`);
    expect(sitemapXml).toContain(`${SITE}/privacy.html`);
    expect(sitemapXml).toContain(`${SITE}/support.html`);
  });

  it("points robots.txt at the sitemap", () => {
    expect(robotsTxt).toContain(`Sitemap: ${SITE}/sitemap.xml`);
  });

  it("names FDA and USDA FSIS in the PWA manifest copy", () => {
    expect(viteConfig).toContain('name: "Beanstalk — FDA and USDA FSIS food recall search"');
    expect(viteConfig).toContain("Search FDA openFDA and USDA FSIS food recall records");
  });
});
