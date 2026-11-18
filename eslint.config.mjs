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
    // Native app projects (Capacitor copies its own JS into them).
    "ios/**",
    "android/**",
    // Other Claude Code sessions' worktrees (their own checkouts, not app code).
    ".claude/**",
  ]),
]);

export default eslintConfig;
