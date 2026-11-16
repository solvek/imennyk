// Reads a marriage book straight from the command line. Run it on its own (tmux is enough); a model
// session is the thing this replaces. A scan already written by this run is skipped, so stopping
// and starting again continues at the next page.
import { type ChildProcess, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { requireOperator } from "../credits/local.ts";
import { openCaseDb } from "../indexing/db.ts";
import { caseHints } from "../indexing/hints.ts";
import { startRun } from "../indexing/run.ts";
import { addScans } from "../indexing/scans.ts";
import { browserIsUp, browserSource, chromiumProfile, launchChromium } from "./browser.ts";
import { surnamesOf } from "./dictionary.ts";
import { applyEnv, parseEnvFile } from "./env.ts";
import { imageSize } from "./image.ts";
import { magickSize, magickStrips } from "./magick.ts";
import { parseJsonText } from "./json.ts";
import {
  createModel,
  DEFAULT_MODEL,
  type Effort,
  parseModelSpec,
  type ReadingModel,
} from "./model.ts";
import { latestRun, readScanNames } from "./progress.ts";
import { ReadError, readPreparedScan } from "./read.ts";
import {
  driveFolderId,
  driveSource,
  folderSource,
  listSource,
  type ScanSource,
} from "./sources.ts";
import { EMPTY_STATE, formatStateFile, parseStateFile, type ReadState } from "./state.ts";

const USAGE = `usage: pnpm read --case <dir> --from <source> [options]
  Run this on its own, for example inside tmux. It does not need a model session.

  --from folder:<dir>     images in a directory
  --from list:<file.tsv>  lines of "name<tab>url" (a Drive file link is a url)
  --from drive:<folder>   a Google Drive folder id or a folders/ URL
                          (IMENNYK_GOOGLE_CLIENT_ID, IMENNYK_GOOGLE_CLIENT_SECRET,
                          IMENNYK_GOOGLE_REFRESH_TOKEN)
  --from browser:<url>    a page opened in Chromium; a login uses IMENNYK_SITE_USER
                          and IMENNYK_SITE_PASSWORD
  --model provider:name   default ${DEFAULT_MODEL}
  --effort low|medium|high
  --note <text>           which book this run is; the same note continues the same run
  --surnames <file>       one surname per line, added to the dictionary of the case
  --limit <n>             stop after n new scans
  --new                   start a new run instead of continuing
  --dry-run               list the scans that would be read, and write nothing

  The key is IMENNYK_OPENAI_KEY or IMENNYK_ANTHROPIC_KEY, in the environment or in .env
  of this repository. A scan this run has already written is skipped.`;

const EFFORTS: readonly Effort[] = ["low", "medium", "high"];

function loadProjectEnv(): void {
  const paths = [
    join(import.meta.dirname, "../..", ".env"),
    join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "imennyk", "read.env"),
  ];
  for (const path of paths) {
    if (!existsSync(path)) continue;
    applyEnv(parseEnvFile(readFileSync(path, "utf8")), process.env);
  }
}

function measure(bytes: Uint8Array): { width: number; height: number } {
  try {
    return imageSize(bytes);
  } catch {
    return magickSize(bytes);
  }
}

function effortOf(value: string | undefined): Effort {
  if (value === undefined) return "low";
  const found = EFFORTS.find((effort) => effort === value);
  if (found === undefined) throw new Error(`effort is low, medium or high: ${value}`);
  return found;
}

function limitOf(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1) throw new Error(`limit is a whole number: ${value}`);
  return limit;
}

function required(env: Readonly<Record<string, string | undefined>>, name: string): string {
  const value = env[name];
  if (value === undefined || value === "") throw new Error(`${name} is not set`);
  return value;
}

function browserBinary(env: Readonly<Record<string, string | undefined>>): string {
  const named = env.IMENNYK_CHROMIUM;
  if (named !== undefined && named !== "") return named;
  for (const name of ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable"]) {
    try {
      execFileSync("which", [name], { stdio: "ignore" });
      return name;
    } catch {
      // the next name
    }
  }
  throw new Error("no Chromium binary found; set IMENNYK_CHROMIUM");
}

async function openSource(
  from: string,
  caseDir: string,
  env: Readonly<Record<string, string | undefined>>,
): Promise<{ readonly source: ScanSource; readonly stop: () => void }> {
  const nothing = (): void => undefined;
  if (from.startsWith("folder:")) {
    return { source: folderSource(from.slice("folder:".length), measure), stop: nothing };
  }
  if (from.startsWith("list:")) {
    return {
      source: listSource(readFileSync(from.slice("list:".length), "utf8"), fetch, measure),
      stop: nothing,
    };
  }
  if (from.startsWith("drive:")) {
    return {
      source: driveSource({
        folderId: driveFolderId(from.slice("drive:".length)),
        clientId: required(env, "IMENNYK_GOOGLE_CLIENT_ID"),
        clientSecret: required(env, "IMENNYK_GOOGLE_CLIENT_SECRET"),
        refreshToken: required(env, "IMENNYK_GOOGLE_REFRESH_TOKEN"),
        measure,
      }),
      stop: nothing,
    };
  }
  if (from.startsWith("browser:")) {
    const endpoint = env.IMENNYK_BROWSER ?? "http://127.0.0.1:9222";
    let child: ChildProcess | undefined;
    if (!(await browserIsUp(endpoint))) {
      const port = Number(new URL(endpoint).port || "9222");
      child = launchChromium({
        port,
        profileDir: chromiumProfile(caseDir),
        binary: browserBinary(env),
      });
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if (await browserIsUp(endpoint)) break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    const user = env.IMENNYK_SITE_USER;
    const password = env.IMENNYK_SITE_PASSWORD;
    const source = await browserSource({
      endpoint,
      pageUrl: from.slice("browser:".length),
      ...(user !== undefined && user !== "" && password !== undefined && password !== ""
        ? { user, password }
        : {}),
    });
    return { source, stop: () => child?.kill() };
  }
  throw new Error(`unknown source «${from}»\n${USAGE}`);
}

function loadSurnames(db: ReturnType<typeof openCaseDb>, file: string | undefined): string[] {
  const found = surnamesOf(caseHints(db));
  if (file === undefined) return found;
  const extra = readFileSync(file, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
  return [...new Set([...found, ...extra])];
}

function loadState(path: string, runId: number): ReadState {
  if (!existsSync(path)) return EMPTY_STATE;
  try {
    const file = parseStateFile(parseJsonText(readFileSync(path, "utf8")));
    return file.runId === runId ? file.state : EMPTY_STATE;
  } catch {
    console.error(`ignoring the state file ${path}: it is not a state of this run`);
    return EMPTY_STATE;
  }
}

async function main(argv: string[]): Promise<void> {
  loadProjectEnv();
  const { values } = parseArgs({
    args: argv,
    options: {
      case: { type: "string" },
      from: { type: "string" },
      model: { type: "string" },
      effort: { type: "string" },
      note: { type: "string" },
      surnames: { type: "string" },
      limit: { type: "string" },
      new: { type: "boolean" },
      "dry-run": { type: "boolean" },
    },
  });
  if (values.case === undefined || values.from === undefined) {
    console.log(USAGE);
    process.exitCode = 1;
    return;
  }
  const effort = effortOf(values.effort);
  const limit = limitOf(values.limit);
  const spec = values.model ?? DEFAULT_MODEL;
  parseModelSpec(spec);
  const db = openCaseDb(join(values.case, "case.sqlite"));
  const runId = values.new === true ? undefined : latestRun(db, spec, values.note);
  const id =
    runId ??
    startRun(db, {
      startedAt: new Date().toISOString(),
      model: spec,
      operator: requireOperator(),
      effort,
      ...(values.note !== undefined ? { note: values.note } : {}),
    });
  const opened = await openSource(values.from, values.case, process.env);
  try {
    await readListed(opened.source, {
      db,
      runId: id,
      caseDir: values.case,
      spec,
      effort,
      surnamesFile: values.surnames,
      limit,
      dry: values["dry-run"] === true,
    });
  } finally {
    opened.stop();
  }
}
interface Listed {
  readonly db: ReturnType<typeof openCaseDb>;
  readonly runId: number;
  readonly caseDir: string;
  readonly spec: string;
  readonly effort: Effort;
  readonly surnamesFile: string | undefined;
  readonly limit: number | undefined;
  readonly dry: boolean;
}

async function readListed(source: ScanSource, listed: Listed): Promise<void> {
  const refs = await source.list();
  const seen = new Set<string>();
  for (const ref of refs) {
    if (seen.has(ref.name)) throw new Error(`two scans are named ${ref.name}`);
    seen.add(ref.name);
  }
  const done = readScanNames(listed.db, listed.runId);
  const statePath = join(listed.caseDir, "read-state.json");
  let state = loadState(statePath, listed.runId);
  const surnames = loadSurnames(listed.db, listed.surnamesFile);
  let model: ReadingModel | undefined;
  let wrote = 0;
  let skipped = 0;
  for (const ref of refs) {
    if (done.has(ref.name)) {
      skipped += 1;
      if (listed.dry) console.log(`skip\t${ref.name}`);
      continue;
    }
    if (listed.limit !== undefined && wrote >= listed.limit) break;
    if (listed.dry) {
      console.log(`read\t${ref.name}`);
      wrote += 1;
      continue;
    }
    try {
      const file = await source.open(ref);
      addScans(listed.db, [
        { name: file.name, url: file.url, width: file.width, height: file.height },
      ]);
      model ??= createModel(listed.spec, process.env);
      const result = await readPreparedScan({
        db: listed.db,
        runId: listed.runId,
        scan: file,
        images: magickStrips(file.bytes, file),
        model,
        state,
        surnames,
        effort: listed.effort,
      });
      state = result.state;
      writeFileSync(statePath, formatStateFile({ runId: listed.runId, state }));
      writeFileSync(
        join(listed.caseDir, "read-usage.jsonl"),
        `${JSON.stringify({ scan: file.name, ...result.usage })}\n`,
        { flag: "a" },
      );
      wrote += 1;
      console.log(
        `${file.name}\tevents ${String(result.events)}\tin ${String(result.usage.inputTokens)}\tout ${String(result.usage.outputTokens)}`,
      );
    } catch (error) {
      if (error instanceof ReadError) {
        const dir = join(listed.caseDir, "failed");
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, `${ref.name}.txt`), error.raw);
      }
      console.error(`${ref.name}: ${error instanceof Error ? error.message : "failed"}`);
      console.error(`run ${String(listed.runId)} stopped; the next start continues here`);
      process.exitCode = 1;
      return;
    }
  }
  console.log(`run ${String(listed.runId)}: wrote ${String(wrote)}, skipped ${String(skipped)}`);
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "failed");
  process.exitCode = 1;
});
