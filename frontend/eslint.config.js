import js from "@eslint/js";
import ts from "typescript-eslint";
export default ts.config(js.configs.recommended, ...ts.configs.recommended, {
  files: ["src/**/*.{ts,tsx}"],
  languageOptions: {
    globals: {
      window: "readonly",
      document: "readonly",
      navigator: "readonly",
      location: "readonly",
      console: "readonly",
      localStorage: "readonly",
      setTimeout: "readonly",
      clearTimeout: "readonly",
      requestAnimationFrame: "readonly",
      crypto: "readonly",
      fetch: "readonly",
      Image: "readonly",
      URL: "readonly",
      atob: "readonly",
      btoa: "readonly",
      Blob: "readonly",
    },
  },
  rules: {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
  },
});
