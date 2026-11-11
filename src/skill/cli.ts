// pnpm build:skill — writes the scripts of the skill built from src/ (see docs/skill.md).
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { buildSkillScripts, SKILL_SCRIPTS_DIR } from "./build.ts";

const root = join(import.meta.dirname, "../..");
const files = await buildSkillScripts(root);
const out = join(root, SKILL_SCRIPTS_DIR);
mkdirSync(out, { recursive: true });
// What was built before goes first, so that a chunk or a migration removed from src/ does not stay
// in the skill. The hand-written helpers live in subfolders of scripts/ and are kept.
rmSync(join(out, "migrations"), { recursive: true, force: true });
for (const file of readdirSync(out, { withFileTypes: true })) {
  if (file.isFile() && file.name.endsWith(".mjs")) rmSync(join(out, file.name));
}
for (const [path, text] of files) {
  mkdirSync(dirname(join(out, path)), { recursive: true });
  writeFileSync(join(out, path), text);
}
console.log(
  `built ${String(files.size)} files into ${SKILL_SCRIPTS_DIR}/ (${readdirSync(out).join(", ")})`,
);
