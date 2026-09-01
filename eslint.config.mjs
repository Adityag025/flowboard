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

    // Generated output, none of it ours to lint.
    //
    // `.vercel/output` is what `vercel build` produces -- bundled and minified
    // JS that trips ~2000 rules and drowns any real finding. It is gitignored,
    // so CI never saw it, but anyone who runs a local Vercel build then lints
    // gets a wall of noise and learns to stop reading lint output.
    ".vercel/**",

    // The Prisma client is generated on every `prisma generate`; linting it
    // reports on Prisma's codegen, not on this project.
    "src/generated/**",

    // Coverage reports.
    "coverage/**",
  ]),
]);

export default eslintConfig;
