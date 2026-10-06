// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Disallow unused variables (use _ prefix to ignore)
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Disallow explicit any
      "@typescript-eslint/no-explicit-any": "warn",
      // Turn off consistent-type-imports because NestJS DI relies on runtime class metadata
      "@typescript-eslint/consistent-type-imports": "off",
    },
  },
  {
    // Relax some rules for test files
    files: ["**/*.spec.ts", "**/*.test.ts", "**/test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // Ignore build outputs and generated files
    ignores: [
      "**/dist/**",
      "**/build/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/*.js",
      "**/*.mjs",
      "**/*.d.ts",
    ],
  }
);
