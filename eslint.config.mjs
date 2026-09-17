import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: ["node_modules/**", "tracker.sqlite*"],
  },
  js.configs.recommended,
  {
    files: ["src/**/*.js", "test/**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "commonjs",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Allow intentionally-unused args (e.g. `_opts`) to be marked with a prefix.
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-console": "off", // this is a bot; stdout logging is the interface
    },
  },
];
