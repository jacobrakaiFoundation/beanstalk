const ALLOWED_PATHS = new Set(["/food/enforcement.json", "/food/event.json"]);
const FDA_ORIGIN = "https://api.fda.gov";
const EXPOSE_HEADERS = "Link, X-OpenFDA-Search-After";

export function parseSearchAfterFromLink(linkHeader) {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(",")) {
    const rel = part.toLowerCase();
    if (!rel.includes('rel="next"') && !rel.includes("rel='next'") && !rel.includes("rel=next")) continue;
    const start = part.indexOf("<");
    const end = part.indexOf(">", start + 1);
    if (start === -1 || end === -1) continue;
    try {
      const url = new URL(part.slice(start + 1, end), FDA_ORIGIN);
      const token = url.searchParams.get("search_after");
      if (token) return token;
    } catch {
      /* ignore malformed Link URLs */
    }
  }
  return null;
}

export function rewriteOpenFdaLinkHeader(linkHeader, origin) {
  if (!linkHeader) return null;
  return linkHeader
    .split(",")
    .map((part) => {
      const start = part.indexOf("<");
      const end = part.indexOf(">", start + 1);
      if (start === -1 || end === -1) return part;
      try {
        const upstream = new URL(part.slice(start + 1, end), FDA_ORIGIN);
        upstream.searchParams.delete("api_key");
        const path = upstream.pathname.includes("/food/")
          ? `/food/${upstream.pathname.split("/food/").pop()}`
          : upstream.pathname;
        if (!ALLOWED_PATHS.has(path)) return part;
        const dest = new URL(path, origin);
        dest.search = upstream.search;
        return `${part.slice(0, start)}<${dest.toString()}>${part.slice(end + 1)}`;
      } catch {
        return part;
      }
    })
    .join(",");
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Expose-Headers": EXPOSE_HEADERS,
    "Access-Control-Max-Age": "86400",
  };
}

function jsonError(status, message) {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return jsonError(405, "Method not allowed");
    }

    const incoming = new URL(request.url);
    if (!ALLOWED_PATHS.has(incoming.pathname)) {
      return jsonError(404, "Not found");
    }

    const upstream = new URL(`${FDA_ORIGIN}${incoming.pathname}`);
    incoming.searchParams.forEach((value, key) => {
      if (key === "api_key") return;
      upstream.searchParams.append(key, value);
    });
    if (env?.OPENFDA_API_KEY) upstream.searchParams.set("api_key", env.OPENFDA_API_KEY);

    const upstreamRes = await fetch(upstream.toString(), {
      method: request.method,
      headers: { Accept: "application/json" },
    });

    const headers = new Headers(corsHeaders());
    const contentType = upstreamRes.headers.get("content-type");
    if (contentType) headers.set("Content-Type", contentType);
    headers.set("Cache-Control", "public, max-age=60");

    const link = upstreamRes.headers.get("Link") ?? upstreamRes.headers.get("link");
    if (link) {
      const rewritten = rewriteOpenFdaLinkHeader(link, incoming.origin) ?? link;
      headers.set("Link", rewritten);
      const token = parseSearchAfterFromLink(rewritten);
      if (token) headers.set("X-OpenFDA-Search-After", token);
    }

    return new Response(request.method === "HEAD" ? null : upstreamRes.body, {
      status: upstreamRes.status,
      headers,
    });
  },
};
