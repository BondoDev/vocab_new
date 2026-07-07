import { handleWordSsrPathname } from "./word-ssr-runtime.mjs";
import {
  API_METHODS,
  PAGE_METHODS,
  buildBlockedWordApiResponse,
  buildMethodNotAllowedResponse,
  buildOptionsResponse,
  buildServerErrorResponse,
  getRequestMethod,
  normalizeWordSsrPathname,
  requestHasTrustedWordRewrite,
} from "./word-ssr-http.mjs";

export function buildWordSsrRequest(req, fallbackUrl = "/") {
  const pathnameValue = req?.query?.pathname ?? req?.url ?? fallbackUrl;
  const pathname = Array.isArray(pathnameValue) ? pathnameValue[0] : pathnameValue;
  const normalizedPathname = normalizeWordSsrPathname(pathname);

  return {
    method: getRequestMethod(req),
    pathname,
    normalizedPathname,
  };
}

export async function handleBlockedWordApiRequest(req) {
  const { method } = buildWordSsrRequest(req);

  if (method === "OPTIONS") {
    return buildOptionsResponse(API_METHODS);
  }

  if (method !== "GET" && method !== "HEAD") {
    return buildMethodNotAllowedResponse(API_METHODS);
  }

  return buildBlockedWordApiResponse();
}

export async function handleInternalWordSsrRequest(req) {
  const { method, pathname, normalizedPathname } = buildWordSsrRequest(req);
  const isTrustedRewrite = requestHasTrustedWordRewrite(req, normalizedPathname);

  if (method === "OPTIONS") {
    return buildOptionsResponse(isTrustedRewrite ? PAGE_METHODS : API_METHODS);
  }

  if (method !== "GET" && method !== "HEAD") {
    return buildMethodNotAllowedResponse(isTrustedRewrite ? PAGE_METHODS : API_METHODS);
  }

  try {
    return await handleWordSsrPathname(normalizedPathname);
  } catch (error) {
    console.error("Word SSR handler failed", {
      pathname,
      error,
    });
    return buildServerErrorResponse();
  }
}
