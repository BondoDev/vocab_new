import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const codeFiles = [
  "*.{js,mjs,cjs,ts}",
  "src/**/*.{js,jsx,ts,tsx}",
  "server/**/*.{js,mjs,cjs,ts}",
  "scripts/**/*.{js,mjs,cjs,ts}",
  "workers/word-ssr/**/*.{js,mjs,cjs,ts,tsx}",
  "supabase/functions/**/*.ts",
];

const unusedOptions = {
  args: "all",
  argsIgnorePattern: "^_",
  caughtErrors: "all",
  caughtErrorsIgnorePattern: "^_",
  ignoreRestSiblings: true,
};

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/.*/**",
      "dist/**",
      "dist-retry-*/**",
      "server-build/**",
      "server-build-retry-*/**",
      "artifacts/**",
      "playwright-report/**",
      "test-results/**",
      "blob-report/**",
      "workers/word-ssr/worker-dist-full/**",
      "workers/word-ssr/assets-full/**",
      "workers/word-ssr/data/full-corpus/**",
      "src/data/seo/wordPages/word-hub-pages/**",
      "src/data/seo/wordPages/word-browse-shards/**",
      "src/data/seo/listPages/verbLists/shared/common100VerbLookup/**",
    ],
  },
  {
    ...js.configs.recommended,
    files: codeFiles,
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": ["warn", unusedOptions],
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-irregular-whitespace": ["error", { skipRegExps: true }],
      "no-useless-escape": "off",
      "prefer-const": "off",
    },
  },
  {
    files: ["src/**/*.{js,jsx,ts,tsx}"],
    languageOptions: { globals: globals.browser },
  },
  {
    files: [
      "*.{js,mjs,cjs,ts}",
      "scripts/**/*.{js,mjs,cjs,ts}",
      "server/**/*.{js,mjs,cjs,ts}",
      "src/entry-server.tsx",
      "workers/word-ssr/{build,generation,diagnostics,tests}/**/*.{js,mjs,cjs,ts}",
    ],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["workers/word-ssr/src/**/*.{js,mjs,ts,tsx}"],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    files: ["supabase/functions/**/*.ts"],
    languageOptions: { globals: { ...globals.worker, Deno: "readonly" } },
  },
  {
    files: ["scripts/tests/account/test-account-intro-popup.mjs"],
    languageOptions: { globals: { window: "readonly" } },
  },
  {
    files: ["scripts/tests/**/*.mjs"],
    rules: { "no-regex-spaces": "off" },
  },
  {
    ...tseslint.configs.eslintRecommended,
    files: ["**/*.{ts,tsx}"],
    languageOptions: { parser: tseslint.parser },
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      ...tseslint.configs.eslintRecommended.rules,
      "no-var": "off",
      "prefer-const": "off",
      "prefer-rest-params": "off",
      "prefer-spread": "off",
      "no-undef": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["warn", unusedOptions],
    },
  },
  {
    files: ["src/**/*.{js,jsx,ts,tsx}", "workers/word-ssr/src/**/*.{js,ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];
