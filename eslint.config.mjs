import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";
export default defineConfig([
  globalIgnores([
    ".next/**",
    ".superpowers/**",
    ".local-backups/**",
    "test-results/**",
    "playwright-report/**",
    "docs/generated/reference/**",
  ]),
  ...tseslint.configs.recommended,
  { rules: { "@typescript-eslint/no-explicit-any": "off" } },
]);
