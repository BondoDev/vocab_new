const STAGING_SITE_ORIGIN = "https://fluentstellar-word-staging.bondoasanidze95.workers.dev";
const PRODUCTION_SITE_ORIGIN = "https://www.fluentstellar.com";

function normalizeDeploymentEnv(value) {
  return value === "production" ? "production" : "staging";
}

function normalizeBooleanFlag(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return String(value).trim().toLowerCase() === "true";
}

function normalizeHostFromOrigin(origin, fallbackHost) {
  try {
    return new URL(origin).host;
  } catch {
    return fallbackHost;
  }
}

export function resolveWorkerRuntimeConfig(env, requestUrl) {
  const request = new URL(requestUrl);
  const deploymentEnv = normalizeDeploymentEnv(env?.DEPLOYMENT_ENV);
  const siteOrigin =
    env?.SITE_ORIGIN?.trim() ||
    (deploymentEnv === "production" ? PRODUCTION_SITE_ORIGIN : STAGING_SITE_ORIGIN);
  const siteOriginHost = normalizeHostFromOrigin(siteOrigin, request.host);

  return {
    deploymentEnv,
    requestOrigin: request.origin,
    siteOrigin,
    canonicalHost: env?.CANONICAL_HOST?.trim() || siteOriginHost,
    enableCanonicalHostRedirect: normalizeBooleanFlag(env?.ENABLE_CANONICAL_HOST_REDIRECT, false),
    logLabel:
      env?.WORKER_LOG_LABEL?.trim() ||
      (deploymentEnv === "production" ? "Production word worker" : "Staging word worker"),
  };
}

export function getCanonicalHostRedirectLocation(requestUrl, config) {
  if (!config.enableCanonicalHostRedirect) {
    return null;
  }

  const request = new URL(requestUrl);
  const target = new URL(config.siteOrigin);
  if (request.host === target.host) {
    return null;
  }

  const isApexAndWwwPair =
    request.hostname === target.hostname.replace(/^www\./i, "") ||
    target.hostname === request.hostname.replace(/^www\./i, "");
  if (!isApexAndWwwPair) {
    return null;
  }

  const destination = new URL(`${request.pathname}${request.search}`, config.siteOrigin);
  return destination.toString();
}

export function getGlobalRobotsHeader(config, { status, responseKind }) {
  if (config.deploymentEnv !== "production") {
    return "noindex, nofollow";
  }

  if (status === 410 || responseKind === "gone") {
    return "noindex, nofollow";
  }

  return null;
}
