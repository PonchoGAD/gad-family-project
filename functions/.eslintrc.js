// functions/.eslintrc.js
module.exports = {
  root: true,
  env: { es6: true, node: true },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: ["./tsconfig.json"], // берём локальный tsconfig функций
    sourceType: "module",
  },
  extends: [
    "eslint:recommended",
    "plugin:import/errors",
    "plugin:import/warnings",
    "plugin:import/typescript",
    "google",
    "plugin:@typescript-eslint/recommended",
  ],
  plugins: ["@typescript-eslint", "import"],
  ignorePatterns: [
    "lib/**",        // билд
    "generated/**",  // автоген
  ],
  rules: {
    quotes: ["error", "double"],
    "import/no-unresolved": 0,
    indent: ["error", 2],
  },
};
