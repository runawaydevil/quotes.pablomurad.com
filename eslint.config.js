import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "coverage"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  prettier,
  {
    languageOptions: {
      globals: {
        console: "readonly",
        document: "readonly",
        window: "readonly",
        navigator: "readonly",
        localStorage: "readonly",
        fetch: "readonly",
        AbortController: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        KeyboardEvent: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-non-null-assertion": "error",
    },
  },
);
