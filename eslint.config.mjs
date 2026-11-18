import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // packages/core is shared with the Expo app: plain TypeScript only, no framework or app imports.
  {
    files: ["packages/core/**/*.{ts,tsx,mts,cts,js,mjs}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ["next", "react", "react-dom", "react-native", "server-only", "expo"].map((name) => ({
            name,
            message: "packages/core is framework-free: keep this import in the app.",
          })),
          patterns: [
            {
              group: [
                "next/*",
                "react/*",
                "react-dom/*",
                "react-native/*",
                "react-native-*",
                "@react-native/*",
                "@react-native-*/*",
                "expo-*",
                "@expo/*",
                "@capacitor/*",
              ],
              message: "packages/core is framework-free: keep this import in the app.",
            },
            {
              group: ["@/*"],
              message: "packages/core can't import web app code (@/...): move the module into core or use a relative import.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The Expo app lints itself (npm run lint -w @lazychef/mobile).
    "apps/**",
    // Native app projects (Capacitor copies its own JS into them).
    "ios/**",
    "android/**",
    // Other Claude Code sessions' worktrees (their own checkouts, not app code).
    ".claude/**",
  ]),
]);

export default eslintConfig;
