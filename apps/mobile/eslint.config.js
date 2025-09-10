import js from "@eslint/js";
import ts from "typescript-eslint";

export default [
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: { parserOptions: { project: "./tsconfig.json" } },
    rules: {
      "no-duplicate-imports": "error"
    }
  }
];
