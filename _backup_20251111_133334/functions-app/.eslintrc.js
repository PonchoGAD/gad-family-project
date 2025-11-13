// простой ESLint без фанатизма; можно расширить при желании
module.exports = {
  root: true,
  parserOptions: { ecmaVersion: 2022, sourceType: "module" },
  env: { node: true, es2022: true },
  extends: [],
  rules: {
    "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
    "no-constant-condition": ["warn", { "checkLoops": false }]
  }
};
