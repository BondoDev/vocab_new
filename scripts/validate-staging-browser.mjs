process.env.DESKTOP_URL ??=
  "https://fluentstellar-word-staging.bondoasanidze95.workers.dev/ru/english-word-wisdom--B2-04096";
process.env.MOBILE_URL ??=
  "https://fluentstellar-word-staging.bondoasanidze95.workers.dev/es/english-word-glance--B2-03707";
process.env.OUTPUT_DIR ??= "artifacts/staging-browser-validation";
process.env.VALIDATION_LABEL ??= "staging";
process.env.CHECK_HEADER_INTERACTIONS ??= "false";

await import("./validate-worker-browser.mjs");
