// @ts-check
import eslint from "@eslint/js";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // skills/imennyk/scripts/: the scripts built from src/ (pnpm build:skill) and the helpers moved
  // from Grapa as they are (Chrome over CDP, ImageMagick); those get rewritten in TypeScript at
  // stage 3 of docs/overview.md, until then outside the lint.
  { ignores: ["node_modules/", "dist/", "coverage/", "skills/imennyk/scripts/"] },
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  { files: ["**/*.js"], extends: [tseslint.configs.disableTypeChecked] },
  prettier,
);
