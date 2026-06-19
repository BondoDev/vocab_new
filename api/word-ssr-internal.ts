import { handleWordSsrPathname } from "../server/word-ssr-runtime.mjs";

export default async function handler(req: any, res: any) {
  const pathname = req.query?.pathname ?? req.url ?? "/";

  try {
    const response = await handleWordSsrPathname(pathname);

    res.statusCode = response.status;

    for (const [headerName, headerValue] of Object.entries(response.headers)) {
      res.setHeader(headerName, headerValue);
    }

    res.end(response.body);
  } catch (error) {
    console.error("Word SSR handler failed", {
      pathname,
      error,
    });

    res.statusCode = 500;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end("<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>Server Error</title></head><body><h1>Server Error</h1><p>The requested page could not be rendered.</p></body></html>");
  }
}
