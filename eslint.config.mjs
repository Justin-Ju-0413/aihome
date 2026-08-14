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
    ".worktrees/**",
    // Rust build artifacts are never linted (gitignored but present locally)
    "src-tauri/target/**",
    // Desktop standalone resources bundle (generated build output)
    "standalone-resources/**",
    // Playwright artifacts are regenerated per run (can vanish mid-lint)
    "test-results/**",
    "playwright-report/**",
  ]),
  // E2E tests are Playwright tests, not React components: the React Hooks
  // rules do not apply, and test code legitimately uses `any` for API
  // payloads and fixture parameters relied on for their setup side effects.
  {
    files: ["e2e/**"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
      "react-hooks/exhaustive-deps": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
]);

export default eslintConfig;
