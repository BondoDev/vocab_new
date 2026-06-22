const BLOCKED_HTML =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Page Not Found | FluentStellar</title><meta name="description" content="The requested page could not be found on FluentStellar."><meta name="robots" content="noindex, nofollow"></head><body><main><h1>Page Not Found</h1><p>The requested page could not be found.</p></main></body></html>';

const SERVER_ERROR_HTML =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Server Error</title></head><body><h1>Server Error</h1><p>The requested page could not be rendered.</p></body></html>';

const PAGE_METHODS = "GET, HEAD, OPTIONS";
const API_METHODS = "GET, HEAD, OPTIONS";

function getHeaderValue(req, headerName) {
  const rawValue = req?.headers?.[headerName];
  if (Array.isArray(rawValue)) {
    return rawValue[0] ?? "";
  }

  return typeof rawValue === "string" ? rawValue : "";
}
export function normalizeWordSsrPathname(pathname) {
  const rawValue = Array.isArray(pathname) ? pathname[0] : pathname;
  const withLeadingSlash = `/${String(rawValue ?? "/").replace(/^\/+/, "")}`;
  const normalized = withLeadingSlash.split(/[?#]/, 1)[0] || "/";

  if (normalized.length > 1 && normalized.endsWith("/")) {
    return normalized.replace(/\/+$/, "");
  }

  return normalized;
}

export function getRequestMethod(req) {
  return String(req?.method ?? "GET").toUpperCase();
}

export function buildBlockedWordApiResponse(status = 404) {
  return {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
    body: BLOCKED_HTML,
  };
}

export function buildMethodNotAllowedResponse(allowHeader = PAGE_METHODS) {
  return {
    status: 405,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
      Allow: allowHeader,
    },
    body: BLOCKED_HTML,
  };
}

export function buildOptionsResponse(allowHeader = PAGE_METHODS) {
  return {
    status: 204,
    headers: {
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
      Allow: allowHeader,
    },
    body: "",
  };
}

export function buildServerErrorResponse() {
  return {
    status: 500,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
    body: SERVER_ERROR_HTML,
  };
}

export function requestHasTrustedWordRewrite(req, expectedPathname) {
  const matchedPathname = normalizeWordSsrPathname(getHeaderValue(req, "x-matched-path"));
  const invokePathname = normalizeWordSsrPathname(getHeaderValue(req, "x-invoke-path"));
  const normalizedExpectedPathname = normalizeWordSsrPathname(expectedPathname);

  const candidatePathnames = [matchedPathname, invokePathname].filter(
    (pathname) => pathname !== "/",
  );

  return candidatePathnames.some(
    (pathname) =>
      pathname === normalizedExpectedPathname &&
      pathname !== "/api/word-ssr" &&
      pathname !== "/api/word-ssr-internal" &&
      !pathname.startsWith("/api/"),
  );
}
export function sendNodeResponse(res, response, method = "GET") {
  res.statusCode = response.status;

  for (const [headerName, headerValue] of Object.entries(response.headers)) {
    res.setHeader(headerName, headerValue);
  }

  if (method === "HEAD" || response.status === 204 || response.status === 304) {
    res.end("");
    return;
  }

  res.end(response.body);
}

export { API_METHODS, BLOCKED_HTML, PAGE_METHODS };
