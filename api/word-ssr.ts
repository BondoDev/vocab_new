const BLOCKED_API_HTML =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Page Not Found | FluentStellar</title><meta name="description" content="The requested page could not be found on FluentStellar."><meta name="robots" content="noindex, nofollow"></head><body><main><h1>Page Not Found</h1><p>The requested page could not be found.</p></main></body></html>';

export default function handler(_req: any, res: any) {
  res.statusCode = 404;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.end(BLOCKED_API_HTML);
}
