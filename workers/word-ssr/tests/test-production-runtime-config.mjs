import assert from "node:assert/strict";
import {
  getCanonicalHostRedirectLocation,
  getGlobalRobotsHeader,
  resolveWorkerRuntimeConfig,
} from "../src/runtime-config.mjs";

const productionConfig = resolveWorkerRuntimeConfig(
  {
    DEPLOYMENT_ENV: "production",
    SITE_ORIGIN: "https://www.fluentstellar.com",
    CANONICAL_HOST: "www.fluentstellar.com",
    ENABLE_CANONICAL_HOST_REDIRECT: "true",
  },
  "https://fluentstellar.com/ru/russian-word-privet--A1-00001?src=test",
);

assert.equal(productionConfig.siteOrigin, "https://www.fluentstellar.com");
assert.equal(
  getCanonicalHostRedirectLocation(
    "https://fluentstellar.com/ru/russian-word-privet--A1-00001?src=test",
    productionConfig,
  ),
  "https://www.fluentstellar.com/ru/russian-word-privet--A1-00001?src=test",
);
assert.equal(
  getCanonicalHostRedirectLocation(
    "https://www.fluentstellar.com/ru/russian-word-privet--A1-00001?src=test",
    productionConfig,
  ),
  null,
);
assert.equal(
  getCanonicalHostRedirectLocation(
    "https://fluentstellar.com/ru/%D0%BF%D1%80%D0%B8%D0%B2%D0%B5%D1%82--A1-00001",
    productionConfig,
  ),
  "https://www.fluentstellar.com/ru/%D0%BF%D1%80%D0%B8%D0%B2%D0%B5%D1%82--A1-00001",
);
assert.equal(getGlobalRobotsHeader(productionConfig, { status: 200, responseKind: "html-page" }), null);
assert.equal(
  getGlobalRobotsHeader(productionConfig, { status: 410, responseKind: "gone" }),
  "noindex, nofollow",
);

const stagingConfig = resolveWorkerRuntimeConfig(
  {
    DEPLOYMENT_ENV: "staging",
    SITE_ORIGIN: "https://fluentstellar-word-staging.bondoasanidze95.workers.dev",
  },
  "https://fluentstellar-word-staging.bondoasanidze95.workers.dev/en/english-word-about--A1-00001",
);
assert.equal(
  getGlobalRobotsHeader(stagingConfig, { status: 200, responseKind: "html-page" }),
  "noindex, nofollow",
);

console.log("production runtime config tests passed");
