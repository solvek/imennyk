// Gortach: a local web application to review the result of indexing a case.
import { existsSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { openCaseDb } from "../indexing/db.ts";
import { REVIEW_STATUSES } from "../indexing/enums.ts";
import { rawFiles, wipeRaw } from "../indexing/raw.ts";
import {
  findItem,
  fixName,
  listCases,
  listItems,
  listRuns,
  progress,
  recordErrorRate,
  recordedErrorRate,
  reopen,
  setStatus,
  type ItemFilter,
  type ReviewSet,
  type RunSummary,
} from "../indexing/review.ts";
import { caseHref, casePage, casesPage, errorPage, noDatabasePage } from "./pages.ts";

export interface GortachOptions {
  /** Folder whose sub-folders are the cases. */
  readonly root: string;
  readonly port: number;
  readonly host: string;
}

export interface Gortach {
  readonly port: number;
  close(): Promise<void>;
}

const DATABASE_FILE = "case.sqlite";
const SCAN_NAME = /^[\w.-]+\.jpg$/;
const WHOLE_NUMBER = /^\d+$/;
const TEXT = "text/html; charset=utf-8";

class NotFound extends Error {}

function send(res: ServerResponse, status: number, type: string, body: string | Buffer): void {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}

function redirect(res: ServerResponse, location: string): void {
  res.writeHead(303, { location });
  res.end();
}

async function readForm(req: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buffer.length;
    if (size > 100_000) throw new Error("the request is too large");
    chunks.push(buffer);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}

function setOf(route: string | undefined): ReviewSet | null {
  if (route === "doubts") return "doubt";
  if (route === "sample") return "sample";
  return null;
}

function whole(value: string | null | undefined): number | undefined {
  if (value === null || value === undefined || !WHOLE_NUMBER.test(value.trim())) return undefined;
  return Number(value.trim());
}

function filterOf(params: URLSearchParams, prefix: string): ItemFilter {
  const element = params.get(`${prefix}element`) ?? "";
  const status = params.get(`${prefix}status`) ?? "";
  return {
    ...(element === "" ? {} : { element }),
    ...(REVIEW_STATUSES.some((known) => known === status) ? { status } : {}),
  };
}

/** The run asked for (`run` parameter or field), the latest one when none is named. */
function chooseRun(runs: readonly RunSummary[], value: string | null | undefined): number | null {
  const latest = runs.at(-1);
  if (latest === undefined) return null;
  if (value === null || value === undefined || value === "") return latest.id;
  const id = whole(value);
  if (id === undefined || !runs.some((run) => run.id === id)) throw new NotFound();
  return id;
}

/** The run is named in links and forms only when the case has several. */
function shownRun(runs: readonly RunSummary[], run: number | null): number | null {
  return runs.length > 1 ? run : null;
}

function query(filter: ItemFilter, run: number | null): string {
  const params = new URLSearchParams();
  if (run !== null) params.set("run", String(run));
  if (filter.element !== undefined) params.set("element", filter.element);
  if (filter.status !== undefined) params.set("status", filter.status);
  const text = params.toString();
  return text === "" ? "" : `?${text}`;
}

/** Starts the server; every request opens the database of the case and closes it again. */
export async function startGortach(options: GortachOptions): Promise<Gortach> {
  const server = createServer((req, res) => {
    void handle(options, req, res).catch((error: unknown) => {
      if (res.headersSent) {
        res.end();
      } else if (error instanceof NotFound) {
        send(res, 404, TEXT, errorPage("Не знайдено.", "/"));
      } else {
        const message = error instanceof Error ? error.message : String(error);
        send(res, 400, TEXT, errorPage(message, req.headers.referer ?? "/"));
      }
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(options.port, options.host, () => {
      resolve();
    });
  });
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : options.port;
  return {
    port,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}

async function handle(
  options: GortachOptions,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  let path: string[];
  try {
    path = url.pathname
      .split("/")
      .filter((part) => part !== "")
      .map(decodeURIComponent);
  } catch {
    throw new NotFound();
  }
  const method = req.method ?? "GET";
  if (path.length === 0 && method === "GET") {
    send(res, 200, TEXT, casesPage(listCases(options.root)));
    return;
  }
  const [prefix, caseName, section, ...rest] = path;
  if (prefix !== "c" || caseName === undefined || section === undefined) throw new NotFound();
  // Only a sub-folder of the root is a case: `..`, `/` and unknown names stop here.
  if (!listCases(options.root).includes(caseName)) throw new NotFound();
  const caseDir = join(options.root, caseName);
  if (section === "raw" && method === "GET") {
    const file = rest[0];
    if (file === undefined || rest.length !== 1 || !SCAN_NAME.test(file)) throw new NotFound();
    const path = join(caseDir, "raw", file);
    if (!existsSync(path)) throw new NotFound();
    send(res, 200, "image/jpeg", readFileSync(path));
    return;
  }
  if (section === "raw" && method === "POST" && rest.length === 1 && rest[0] === "wipe") {
    wipeRaw(caseDir);
    redirect(res, caseHref(caseName, "doubt"));
    return;
  }
  const set = setOf(section);
  if (set === null) throw new NotFound();
  const databasePath = join(caseDir, DATABASE_FILE);
  // `openCaseDb` would create an empty database in a folder that has none.
  if (!existsSync(databasePath)) {
    if (method !== "GET" || rest.length > 0) throw new NotFound();
    send(res, 200, TEXT, noDatabasePage(caseName));
    return;
  }
  const db = openCaseDb(databasePath);
  try {
    if (method === "GET" && rest.length === 0) {
      send(res, 200, TEXT, showCase(db, options, caseName, set, url.searchParams));
    } else if (method === "POST") {
      const form = await readForm(req);
      const back = act(db, caseDir, caseName, set, rest, form);
      redirect(res, back);
    } else {
      throw new NotFound();
    }
  } finally {
    db.close();
  }
}

function showCase(
  db: DatabaseSync,
  options: GortachOptions,
  caseName: string,
  set: ReviewSet,
  params: URLSearchParams,
): string {
  const filter = set === "doubt" ? filterOf(params, "") : {};
  const runs = listRuns(db);
  const run = chooseRun(runs, params.get("run"));
  // A case without runs has nothing to show: no run has the id 0.
  const runId = run ?? 0;
  return casePage({
    caseName,
    set,
    runs,
    run,
    items: listItems(db, set, runId, filter),
    doubts: progress(db, "doubt", runId),
    sample: progress(db, "sample", runId),
    filter,
    rawCount: rawFiles(join(options.root, caseName)).length,
    recorded: recordedErrorRate(db, join(options.root, caseName), runId),
    context: {
      caseName,
      filter,
      run: shownRun(runs, run),
      hasScan: (file) => existsSync(join(options.root, caseName, "raw", file)),
    },
  });
}

/** Runs one action; returns where to go next. A failed action throws and changes nothing. */
function act(
  db: DatabaseSync,
  caseDir: string,
  caseName: string,
  set: ReviewSet,
  rest: readonly string[],
  form: URLSearchParams,
): string {
  const filter = filterOf(form, "f_");
  const runs = listRuns(db);
  const run = chooseRun(runs, form.get("run"));
  if (run === null) throw new NotFound();
  const tab = caseHref(caseName, set, query(filter, shownRun(runs, run)));
  if (set === "sample" && rest.length === 1 && rest[0] === "rate") {
    recordErrorRate(db, caseDir, run);
    return tab;
  }
  const id = whole(rest[0]);
  const action = rest[1];
  if (id === undefined || action === undefined || rest.length !== 2) throw new NotFound();
  const ref = { set, id } as const;
  if (findItem(db, ref, run) === undefined) throw new NotFound();
  const note = form.get("note") ?? undefined;
  switch (action) {
    case "status": {
      const status = form.get("status");
      if (status !== "confirmed" && status !== "unknown") throw new Error("невідомий стан");
      setStatus(db, ref, status, note);
      break;
    }
    case "fix": {
      const value = (form.get("value") ?? "").trim();
      // Saving the value as it is changes nothing: only a different value is a fix.
      if (value !== findItem(db, ref, run)?.currentValue) fixName(db, ref, value, note);
      break;
    }
    case "reopen":
      reopen(db, ref);
      break;
    default:
      throw new NotFound();
  }
  // No anchor: a reviewed item moves below the open ones, so the next open one is at the top.
  return tab;
}
