import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/.next/**",
      "coverage/**",
      "dist/**",
      "node_modules/**",
      "**/_migration-source/**",
      "pnpm-lock.yaml",
      "reference/**"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        Buffer: "readonly",
        caches: "readonly",
        console: "readonly",
        fetch: "readonly",
        process: "readonly",
        self: "readonly",
        URL: "readonly"
      }
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error"
    }
  }
);
