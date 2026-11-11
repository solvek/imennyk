import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { SCHEMA_VERSION } from "../../src/indexing/db.ts";
import { buildSkillScripts, SKILL_SCRIPTS_DIR } from "../../src/skill/build.ts";

const ROOT = join(import.meta.dirname, "../..");
const SKILL = join(ROOT, "skills/imennyk");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

describe("skill scripts", () => {
  it("are what the build of the current src/ gives", async () => {
    const built = await buildSkillScripts(ROOT);
    const scriptsDir = join(ROOT, SKILL_SCRIPTS_DIR);
    // Generated files only: the scripts at the top of scripts/ and the migrations. The hand-written
    // helpers live in subfolders.
    const onDisk = walk(scriptsDir)
      .map((path) => relative(scriptsDir, path).split(sep).join("/"))
      .filter(
        (path) => (!path.includes("/") && path.endsWith(".mjs")) || path.startsWith("migrations/"),
      );
    const stale = [...built].filter(([path, text]) => {
      const file = join(scriptsDir, path);
      return !existsSync(file) || readFileSync(file, "utf8") !== text;
    });
    expect(
      stale.map(([path]) => `${SKILL_SCRIPTS_DIR}/${path}`),
      "run `pnpm build:skill`",
    ).toEqual([]);
    expect(onDisk.toSorted(), "run `pnpm build:skill`").toEqual([...built.keys()].toSorted());
  });

  it("create a bank with only Node.js, outside the repository", () => {
    const dir = mkdtempSync(join(tmpdir(), "imennyk-skill-"));
    cpSync(join(ROOT, SKILL_SCRIPTS_DIR), join(dir, "scripts"), { recursive: true });
    execFileSync(process.execPath, [join(dir, "scripts/indexing.mjs"), "init", join(dir, "case")], {
      cwd: dir,
      stdio: "pipe",
    });
    const db = new DatabaseSync(join(dir, "case/case.sqlite"));
    const { user_version: version } = z
      .object({ user_version: z.number() })
      .parse({ ...db.prepare("pragma user_version").get() });
    db.close();
    expect(version).toBe(SCHEMA_VERSION);
  });
});

describe("operator in the skill scripts", () => {
  it("is asked for before the first run and then kept in the run", () => {
    const dir = mkdtempSync(join(tmpdir(), "imennyk-operator-"));
    const script = join(ROOT, SKILL_SCRIPTS_DIR, "indexing.mjs");
    const env = { ...process.env, IMENNYK_OPERATOR: join(dir, "config/operator.yaml") };
    const run = (...args: string[]) =>
      spawnSync(process.execPath, [script, ...args], { cwd: dir, env, encoding: "utf8" });
    const caseDir = join(dir, "case");
    expect(run("init", caseDir).status).toBe(0);

    expect(run("operator").status).toBe(3);
    const refused = run("run-start", caseDir, "--model", "m");
    expect(refused.status).not.toBe(0);
    expect(refused.stderr).toContain("Ask the person");

    expect(run("operator", "--set", "[Jane Doe](mailto:jane@example.org)").status).toBe(0);
    expect(run("operator").stdout.trim()).toBe("[Jane Doe](mailto:jane@example.org)");
    const started = run("run-start", caseDir, "--model", "m");
    expect(started.status).toBe(0);
    expect(run("run-report", caseDir, started.stdout.trim()).stdout).toContain(
      'operator: "[Jane Doe](mailto:jane@example.org)"',
    );
  });
});

describe("skill folder", () => {
  it("has SKILL.md named imennyk, with a description", () => {
    const text = readFileSync(join(SKILL, "SKILL.md"), "utf8");
    const head = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? "";
    expect(head).toMatch(/^name: imennyk$/m);
    expect(head).toMatch(/^description: .{40,}$/m);
  });

  it("links only to files inside the skill", () => {
    const broken: string[] = [];
    for (const file of walk(SKILL).filter((path) => path.endsWith(".md"))) {
      // Code spans and blocks show examples of Markdown, not links.
      const text = readFileSync(file, "utf8").replace(/```[\s\S]*?```|`[^`\n]*`/g, "");
      for (const match of text.matchAll(/\]\(([^)\s]+)\)/g)) {
        const target = match[1] ?? "";
        if (/^[a-z]+:/.test(target) || target.startsWith("#")) continue;
        const path = resolve(dirname(file), decodeURIComponent(target.split("#")[0] ?? ""));
        if (!path.startsWith(SKILL + sep) || !existsSync(path)) {
          broken.push(`${relative(ROOT, file)} → ${target}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it("holds no banks, no scans and no dictionaries of one parish or case", () => {
    const files = walk(SKILL).map((path) => relative(SKILL, path));
    expect(files.filter((path) => /\.(sqlite|jpe?g|png|tiff?)$/i.test(path))).toEqual([]);
    expect(files.filter((path) => path.startsWith("references/dictionaries/"))).toEqual([
      "references/dictionaries/README.md",
      "references/dictionaries/patronymics.tsv",
      "references/dictionaries/words-registers.tsv",
    ]);
  });
});

describe("Claude Code plugin", () => {
  const manifest = z.object({ name: z.string(), version: z.string() });
  const marketplace = z.object({
    name: z.string(),
    owner: z.object({ name: z.string() }),
    plugins: z.array(z.object({ name: z.string(), source: z.string() })),
  });

  it("lists the repository as the one plugin of its marketplace", () => {
    const plugin = manifest.parse(
      JSON.parse(readFileSync(join(ROOT, ".claude-plugin/plugin.json"), "utf8")),
    );
    const market = marketplace.parse(
      JSON.parse(readFileSync(join(ROOT, ".claude-plugin/marketplace.json"), "utf8")),
    );
    expect(plugin.name).toBe("imennyk");
    expect(market.plugins.map(({ name, source }) => ({ name, source }))).toEqual([
      { name: "imennyk", source: "./" },
    ]);
  });
});
