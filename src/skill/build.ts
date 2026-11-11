// Builds the scripts of the skill (skills/imennyk/scripts/) from the command lines in src/: each
// one bundled into a single ES module that needs only Node.js, with the bank migrations beside it.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { build } from "esbuild";

/** Folder of the skill scripts, relative to the root of the repository. */
export const SKILL_SCRIPTS_DIR = "skills/imennyk/scripts";

/** Command lines of src/ and the script name each becomes in the skill. */
const ENTRIES = {
  indexing: "src/indexing/cli.ts",
  gortach: "src/gortach/cli.ts",
  "familysearch-tree": "src/familysearch/tree/cli.ts",
} as const;

const MIGRATIONS = "src/indexing/migrations";

const BANNER = "// Built by `pnpm build:skill` from src/; do not edit by hand.";
const REQUIRE =
  'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);';

/**
 * Returns every built file as path (relative to {@link SKILL_SCRIPTS_DIR}) → text. Writes nothing:
 * the command line writes the files, and a test compares them with the ones in the repository.
 * The output depends only on the sources: no minification, no source maps, no time of building.
 */
export async function buildSkillScripts(repoRoot: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  // One build for all the command lines: what they share (zod, yaml, the bank) goes into chunks
  // beside them instead of into every script. The chunks stay in scripts/ too, since db.ts finds
  // the migrations beside the module that holds it.
  const result = await build({
    absWorkingDir: repoRoot,
    entryPoints: Object.entries(ENTRIES).map(([out, entry]) => ({ in: entry, out })),
    outdir: "out",
    outExtension: { ".js": ".mjs" },
    chunkNames: "chunk-[hash]",
    bundle: true,
    splitting: true,
    platform: "node",
    format: "esm",
    target: "node24",
    write: false,
    legalComments: "none",
    // yaml is CommonJS and calls require() on Node built-ins, which an ES module lacks.
    banner: { js: `${BANNER}\n${REQUIRE}` },
    logLevel: "silent",
  });
  const outDir = join(repoRoot, "out");
  for (const output of result.outputFiles) {
    files.set(relative(outDir, output.path), output.text);
  }
  // db.ts reads the migrations from the folder beside the module, which in the skill is scripts/.
  const migrations = join(repoRoot, MIGRATIONS);
  for (const file of readdirSync(migrations).filter((f) => f.endsWith(".sql"))) {
    files.set(`migrations/${file}`, readFileSync(join(migrations, file), "utf8"));
  }
  return files;
}
