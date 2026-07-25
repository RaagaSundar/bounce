import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The demo frontend, kept as the reference implementation while its screens
    // are ported into app/. It was written against oxlint, so it trips rules it
    // was never checked against. Each file gets linted properly once it lands in
    // app/; drop this entry when src/ is gone.
    "src/**",
  ]),
]);

export default eslintConfig;
