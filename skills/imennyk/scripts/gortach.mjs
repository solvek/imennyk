// Built by `pnpm build:skill` from src/; do not edit by hand.
import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);
import {
  namePart
} from "./chunk-T57SJMFP.mjs";
import {
  REVIEW_STATUSES,
  external_exports,
  inTransaction,
  openCaseDb,
  readRunErrorRate,
  selectRows,
  writeRunErrorRate
} from "./chunk-IPSGNSK4.mjs";

// src/gortach/cli.ts
import { hostname, userInfo } from "node:os";
import { parseArgs } from "node:util";

// src/gortach/server.ts
import { existsSync as existsSync2, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join as join2 } from "node:path";

// src/indexing/raw.ts
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
function rawFiles(caseDir) {
  const dir = join(caseDir, "raw");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name).toSorted();
}
function wipeRaw(caseDir) {
  const files = rawFiles(caseDir);
  for (const name of files) rmSync(join(caseDir, "raw", name));
  return files.length;
}

// src/indexing/review.ts
import { readdirSync as readdirSync2 } from "node:fs";
var NAME_COLUMNS = ["given", "patronymic", "surname"];
function isNameColumn(value) {
  return NAME_COLUMNS.some((column) => column === value);
}
function reviewTone(status) {
  if (status === "confirmed") return "ok";
  if (status === "open") return null;
  return "error";
}
function listCases(root) {
  return readdirSync2(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).toSorted();
}
var itemRow = external_exports.object({
  id: external_exports.number(),
  rank: external_exports.number().nullable(),
  scan: external_exports.string(),
  url: external_exports.string(),
  width: external_exports.number(),
  height: external_exports.number(),
  box_x: external_exports.number().nullable(),
  box_y: external_exports.number().nullable(),
  box_w: external_exports.number().nullable(),
  box_h: external_exports.number().nullable(),
  person_id: external_exports.number().nullable(),
  run_id: external_exports.number(),
  element: external_exports.string(),
  read_text: external_exports.string().nullable(),
  variants: external_exports.string().nullable(),
  agent_note: external_exports.string().nullable(),
  status: external_exports.string(),
  note: external_exports.string().nullable(),
  current_value: external_exports.string().nullable()
});
var DOUBT_SQL = `
  select d.id, null as rank, s.name as scan, s.url, s.width, s.height, b.x as box_x, b.y as box_y, b.w as box_w, b.h as box_h,
         d.person_id, d.run_id, d.element, d.read_text, d.variants, d.note as agent_note,
         d.status, d.resolution as note,
         case d.element when 'given' then p.given when 'patronymic' then p.patronymic
                        when 'surname' then p.surname end as current_value
    from doubt d
    join scan s on s.id = d.scan_id
    left join box b on b.id = d.box_id
    left join person p on p.id = d.person_id`;
var SAMPLE_SQL = `
  select sm.id, sm.rank, s.name as scan, s.url, s.width, s.height, b.x as box_x, b.y as box_y, b.w as box_w, b.h as box_h,
         m.person_id, m.run_id, 'surname' as element, coalesce(sm.read_text, m.text) as read_text,
         null as variants, null as agent_note, sm.status, sm.note, m.text as current_value
    from sample sm
    join name_mention m on m.id = sm.name_mention_id
    join scan s on s.id = m.scan_id
    left join box b on b.id = m.box_id`;
function itemSql(set) {
  return set === "doubt" ? DOUBT_SQL : SAMPLE_SQL;
}
function toStatus(value) {
  const status = REVIEW_STATUSES.find((candidate) => candidate === value);
  if (status === void 0) throw new Error(`unknown review status \xAB${value}\xBB`);
  return status;
}
function toItem(set, row) {
  const editable = row.person_id !== null && (set === "sample" || isNameColumn(row.element));
  return {
    set,
    id: row.id,
    rank: row.rank,
    scan: row.scan,
    url: row.url,
    scanFile: `${row.scan}.jpg`,
    scanWidth: row.width,
    scanHeight: row.height,
    box: row.box_x === null || row.box_y === null || row.box_w === null || row.box_h === null ? null : { x: row.box_x, y: row.box_y, w: row.box_w, h: row.box_h },
    personId: row.person_id,
    element: row.element,
    readText: row.read_text,
    variants: row.variants,
    agentNote: row.agent_note,
    status: toStatus(row.status),
    note: row.note,
    currentValue: row.current_value,
    editable
  };
}
function listItems(db, set, runId, filter = {}) {
  const orderColumn = set === "doubt" ? "d.id" : "sm.rank";
  const statusColumn = set === "doubt" ? "d.status" : "sm.status";
  const elementColumn = set === "doubt" ? "d.element" : "'surname'";
  const runColumn = set === "doubt" ? "d.run_id" : "sm.run_id";
  const params = [runId];
  const where = [`${runColumn} = ?`];
  if (filter.element !== void 0) {
    where.push(`${elementColumn} = ?`);
    params.push(filter.element);
  }
  if (filter.status !== void 0) {
    where.push(`${statusColumn} = ?`);
    params.push(filter.status);
  }
  const sql = `${itemSql(set)}
    where ${where.join(" and ")}
    order by (${statusColumn} <> 'open'), ${orderColumn}`;
  return selectRows(db, itemRow, sql, params).map((row) => toItem(set, row));
}
function getItem(db, ref) {
  const idColumn = ref.set === "doubt" ? "d.id" : "sm.id";
  const row = selectRows(db, itemRow, `${itemSql(ref.set)} where ${idColumn} = ?`, [ref.id])[0];
  if (row === void 0) throw new Error(`no ${ref.set} ${String(ref.id)}`);
  return { item: toItem(ref.set, row), runId: row.run_id };
}
function findItem(db, ref, runId) {
  try {
    const found = getItem(db, ref);
    return found.runId === runId ? found.item : void 0;
  } catch {
    return void 0;
  }
}
var runSummaryRow = external_exports.object({
  id: external_exports.number(),
  model: external_exports.string(),
  note: external_exports.string().nullable(),
  started_at: external_exports.string()
});
function listRuns(db) {
  return selectRows(
    db,
    runSummaryRow,
    "select id, model, note, started_at from run order by id"
  ).map((row) => ({ id: row.id, model: row.model, note: row.note, startedAt: row.started_at }));
}
var progressRow = external_exports.object({ element: external_exports.string(), total: external_exports.number(), reviewed: external_exports.number() });
function progress(db, set, runId) {
  const sql = set === "doubt" ? `select element, count(*) as total, coalesce(sum(status <> 'open'), 0) as reviewed
           from doubt where run_id = ? group by element order by element` : `select 'surname' as element, count(*) as total, coalesce(sum(status <> 'open'), 0) as reviewed
           from sample where run_id = ? having count(*) > 0`;
  const byElement = selectRows(db, progressRow, sql, [runId]);
  return {
    total: byElement.reduce((sum, row) => sum + row.total, 0),
    reviewed: byElement.reduce((sum, row) => sum + row.reviewed, 0),
    byElement
  };
}
function cleanNote(note) {
  const trimmed = note?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}
function writeStatus(db, ref, status, note) {
  if (ref.set === "doubt") {
    db.prepare("update doubt set status = ?, resolution = ? where id = ?").run(
      status,
      note,
      ref.id
    );
    return;
  }
  db.prepare(
    `update sample set read_text = coalesce(read_text, (select text from name_mention where id = name_mention_id))
      where id = ?`
  ).run(ref.id);
  db.prepare("update sample set status = ?, note = ? where id = ?").run(status, note, ref.id);
}
function setStatus(db, ref, status, note) {
  inTransaction(db, () => {
    getItem(db, ref);
    writeStatus(db, ref, status, cleanNote(note));
  });
}
function reopen(db, ref) {
  inTransaction(db, () => {
    getItem(db, ref);
    if (ref.set === "doubt") {
      db.prepare("update doubt set status = 'open', resolution = null where id = ?").run(ref.id);
    } else {
      db.prepare("update sample set status = 'open', note = null where id = ?").run(ref.id);
    }
  });
}
function fixName(db, ref, value, note) {
  const parsed = namePart.safeParse(value.trim());
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((issue) => issue.message).join("; "));
  }
  const { item, runId } = getItem(db, ref);
  const column = ref.set === "sample" ? "surname" : item.element;
  if (!item.editable || item.personId === null || !isNameColumn(column)) {
    throw new Error("only the given name, patronymic and surname can be fixed by a value");
  }
  inTransaction(db, () => {
    if (ref.set === "sample") writeStatus(db, ref, item.status, item.note);
    db.prepare(`update person set ${column} = ? where id = ?`).run(parsed.data, item.personId);
    db.prepare(
      "update name_mention set text = ? where person_id = ? and kind = ? and run_id = ?"
    ).run(parsed.data, item.personId, column, runId);
    writeStatus(db, ref, "fixed", cleanNote(note));
  });
}
function errorRate(db, runId) {
  const rows = selectRows(
    db,
    external_exports.object({ status: external_exports.string() }),
    "select status from sample where run_id = ?",
    [runId]
  );
  if (rows.length === 0) throw new Error("the sample is not built yet");
  const errors = rows.filter((row) => reviewTone(row.status) === "error").length;
  return {
    runId,
    size: rows.length,
    errors,
    percent: Math.round(errors / rows.length * 1e3) / 10
  };
}
function recordErrorRate(db, runId) {
  return inTransaction(db, () => {
    for (const item of listItems(db, "sample", runId, { status: "open" })) {
      writeStatus(db, { set: "sample", id: item.id }, "confirmed", null);
    }
    const rate = errorRate(db, runId);
    writeRunErrorRate(db, rate.runId, rate);
    return rate;
  });
}
function recordedErrorRate(db, runId) {
  try {
    errorRate(db, runId);
  } catch {
    return null;
  }
  return readRunErrorRate(db, runId);
}

// src/gortach/html.ts
function esc(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
function page(locale, title, body, head = "") {
  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/logo.svg" type="image/svg+xml">
<script>
try {
  if (localStorage.getItem("grapa-theme") === "night")
    document.documentElement.dataset.theme = "night";
} catch (e) {}
</script>
${head}<style>
  :root {
    --ink: #1c1b19; --muted: #5e5a55; --line: #e6e2da; --soft: #eeeae4;
    --grape: #5b3a78; --grape-d: #47295f; --tint: #f1ecf5; --leaf: #3f6b48; --leaf-tint: #e9f0ea;
    --bg: #f7f6f3; --card: #fff; --lead: #3d3b38; --on-grape: #fff; --danger: #a3352b;
    --serif: ui-serif, Georgia, "Times New Roman", serif;
    --sans: ui-sans-serif, system-ui, sans-serif;
    --mono: ui-monospace, monospace;
  }
  html[data-theme="night"] {
    --ink: #f3efe8; --muted: #b3aaa0; --line: #3a342e; --soft: #2c2824;
    --grape: #c4a2d6; --grape-d: #d4b8e4; --tint: #2a2230; --leaf: #9dcea8; --leaf-tint: #1e2a22;
    --bg: #161412; --card: #221f1c; --lead: #ddd6cc; --on-grape: #24182e; --danger: #e07a72;
    color-scheme: dark;
  }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.5 var(--sans); }
  a { color: var(--grape); }
  html[data-theme="night"] .mark circle { stroke: #c4a2d6; }
  html[data-theme="night"] .mark path { stroke: #9dcea8; }
  .bar { display: flex; align-items: center; gap: 16px; padding: 16px 0; }
  .brand { display: flex; align-items: center; gap: 8px; color: inherit; text-decoration: none; font-weight: 500; }
  .session { margin-left: auto; display: flex; align-items: center; gap: 12px; font-size: 14px; }
  .menu { display: flex; gap: 20px; font-size: 15px; }
  .menu a { color: inherit; text-decoration: none; }
  .menu a:hover { text-decoration: underline; text-underline-offset: 4px; }
  .queue { color: var(--danger); font-weight: 600; }
  .session form { margin: 0; }
  .session button { font: inherit; color: var(--grape); background: none; border: 0; padding: 0; cursor: pointer; }
  button.theme { display: grid; place-items: center; width: 34px; height: 34px; margin: 0; padding: 0; border: 1px solid var(--line); border-radius: 50%; background: transparent; color: var(--ink); cursor: pointer; }
  button.theme:hover { background: var(--soft); }
  .theme svg { width: 18px; height: 18px; }
  .theme .sun { display: none; }
  html[data-theme="night"] .theme .moon { display: none; }
  html[data-theme="night"] .theme .sun { display: block; }
  .langs { position: relative; }
  .langs summary { display: flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: 6px; font-weight: 600; letter-spacing: 0.04em; list-style: none; cursor: pointer; user-select: none; }
  .langs summary::-webkit-details-marker { display: none; }
  .langs summary::after { content: ""; border: 4px solid transparent; border-top-color: currentColor; border-bottom-width: 0; }
  .langs summary:hover, .langs[open] summary { background: var(--soft); }
  .langs nav { position: absolute; right: 0; top: calc(100% + 4px); z-index: 10; min-width: 10rem; display: flex; flex-direction: column; background: var(--card); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 4px 16px rgb(0 0 0 / 0.08); overflow: hidden; }
  .langs nav a { display: flex; align-items: baseline; gap: 12px; padding: 8px 12px; color: inherit; text-decoration: none; }
  .langs nav a + a { border-top: 1px solid var(--soft); }
  .langs nav a:hover { background: var(--bg); }
  .langs nav a[aria-current="true"] { background: var(--ink); color: var(--bg); pointer-events: none; }
  .langs .code { width: 1.8em; color: var(--muted); font-size: 12px; font-weight: 600; letter-spacing: 0.06em; }
  .langs a[aria-current="true"] .code { color: inherit; }
  .google { display: inline-flex; align-items: center; gap: 10px; margin-top: 16px; padding: 10px 16px; border: 1px solid #dadce0; border-radius: 4px; background: #fff; color: #1f1f1f; font-weight: 500; text-decoration: none; }
  .fine { color: var(--muted); font-size: 13px; }
  .mark { width: 28px; height: 28px; display: block; }
  .wrap { max-width: 1080px; margin: 0 auto; padding: 0 24px 48px; }
  .sheet { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 20px 16px 8px; }
  .place-map { position: relative; margin: 12px 0 16px; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; background: var(--soft); }
  .place-map-canvas { height: 14rem; width: 100%; }
  .place-map-note { margin: 0; padding: 6px 12px; font-size: 13px; color: var(--muted, #666); background: var(--card); }
  .place-map:fullscreen .place-map-note, .place-map-css-fs .place-map-note { display: none; }
  .place-map .leaflet-bar a.place-map-fs { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; color: var(--grape); }
  .place-map:fullscreen { width: 100%; height: 100%; margin: 0; border: 0; border-radius: 0; }
  .place-map:fullscreen .place-map-canvas { height: 100%; }
  .place-map-css-fs { position: fixed; inset: 0; z-index: 10000; margin: 0; border-radius: 0; border: 0; }
  .place-map-css-fs .place-map-canvas { height: 100%; }
  html.place-map-lock { overflow: hidden; }
  h1 { font-size: 32px; font-weight: 500; line-height: 1.15; margin: 32px 0 8px; }
  h2 { color: var(--grape); font-size: 22px; font-weight: 500; line-height: 1.2; margin: 28px 0 8px; }
  h3 { font-size: 18px; font-weight: 500; line-height: 1.25; margin: 22px 0 8px; }
  .kicker { color: var(--grape); font-size: 13px; margin: 0 0 8px; }
  .meta, .aside { color: var(--muted); }
  .meta { margin: 0; }
  .row, .item { padding: 8px 0; border-top: 1px solid var(--soft); }
  .row { display: flex; justify-content: space-between; gap: 16px; }
  .aside { text-align: right; }
  .facts { margin: 4px 0 0; }
  ol, ul { margin: 8px 0 0; padding-left: 1.2rem; }
  code { font-family: var(--mono); }
  .shot { margin: 12px 0 0; }
  .shot img { display: block; max-width: 100%; height: auto; border: 1px solid var(--line); border-radius: 12px; background: var(--card); }
  .shot figcaption { color: var(--muted); font-size: 13px; margin-top: 6px; }
  .addr { display: inline-flex; align-items: center; gap: 4px; }
  .copy { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--grape); cursor: pointer; }
  .copy svg { width: 16px; height: 16px; display: none; }
  .copy .idle { display: block; }
  .copy.copied .idle { display: none; }
  .copy.copied .ok { display: block; }
  .note { white-space: pre-wrap; }
  .md p { margin: 0 0 8px; }
  .md p:last-child { margin-bottom: 0; }
  .md ul, .md ol { margin: 0 0 8px; }
  .md blockquote { margin: 0 0 8px; padding-left: 10px; border-left: 3px solid var(--line); }
  .md pre, .md code { font-family: var(--mono); }
  .md pre { overflow-x: auto; }
  .report { margin: 12px 0 0; font-size: 14px; }
  .form { margin: 8px 0 16px; }
  .form label { display: block; margin-top: 16px; font-weight: 500; }
  .form .fine, .form .error { margin: 2px 0 0; }
  .form input, .form textarea { box-sizing: border-box; width: 100%; margin-top: 6px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--card); color: inherit; font: inherit; }
  .form textarea { resize: vertical; }
  .form button { margin-top: 20px; padding: 10px 18px; border: 0; border-radius: 8px; background: var(--grape); color: var(--on-grape); font: inherit; font-weight: 500; cursor: pointer; }
  .error { color: var(--danger); font-size: 14px; }
  .trap { position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden; }
  .foot { margin: 48px 0 0; padding: 24px 0 0; border-top: 1px solid var(--line); font-size: 13px; display: flex; gap: 8px 22px; flex-wrap: wrap; }
  .foot .credit { margin-right: auto; }
  .sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
  .home .foot { margin-top: 72px; }
  .home .hero { display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 56px; align-items: center; padding: 56px 0 24px; }
  .home .eyebrow { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin: 0 0 20px; font: 12px/1.4 var(--mono); letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); }
  .home .eyebrow::before { content: ""; width: 24px; height: 1.5px; background: var(--grape); }
  .home .live { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px 3px 8px; border-radius: 99px; background: var(--leaf-tint); color: var(--leaf); font: 500 12.5px var(--sans); letter-spacing: 0.02em; text-transform: none; }
  .home .live i { width: 7px; height: 7px; border-radius: 50%; background: currentColor; animation: pulse 2.4s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: 0.3; } }
  @media (prefers-reduced-motion: reduce) { .home .live i { animation: none; } }
  .home h1 { font: 500 clamp(28px, 3.1vw, 46px)/1.12 var(--serif); letter-spacing: -0.02em; margin: 0; max-width: 16em; }
  .home h1 em { display: block; color: var(--grape); font-style: italic; }
  .home h2 { color: inherit; font: 500 clamp(28px, 3.4vw, 38px)/1.15 var(--serif); margin: 0 0 8px; letter-spacing: -0.01em; }
  .home .lead { font-size: 18px; color: var(--lead); margin: 22px 0 0; max-width: 34rem; }
  .home .lead strong { color: var(--ink); }
  .home .lead-list { margin: 10px 0 0; padding-left: 1.2rem; max-width: 34rem; font-size: 18px; color: var(--lead); }
  .home .lead-list li + li { margin-top: 6px; }
  .home .cta { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px; margin-top: 32px; }
  .home .btn { display: inline-flex; align-items: center; gap: 10px; padding: 13px 22px; border-radius: 10px; background: var(--grape); color: var(--on-grape); font-weight: 600; text-decoration: none; }
  .home .btn:hover { background: var(--grape-d); }
  .home .link { color: var(--ink); font-weight: 500; text-underline-offset: 4px; }
  .home .fine { margin: 14px 0 0; font-size: 13.5px; color: var(--muted); }
  .home .chat { background: var(--card); border: 1.5px solid var(--line); border-radius: 16px; padding: 18px; box-shadow: 0 18px 40px -18px rgb(40 20 60 / 0.18); }
  html[data-theme="night"] .home .chat { box-shadow: 0 18px 40px -18px rgb(0 0 0 / 0.55); }
  .home .q { margin-left: auto; max-width: 88%; width: fit-content; padding: 10px 14px; border-radius: 14px 14px 4px 14px; background: var(--soft); font-size: 15px; }
  .home .q b { display: inline-block; margin-right: 6px; padding: 1px 8px; border-radius: 6px; background: var(--tint); color: var(--grape); font-weight: 600; vertical-align: 1px; }
  .home .a { margin-top: 14px; font-size: 14.5px; }
  .home .a p { margin: 0 0 8px; }
  .home .hit { display: flex; align-items: baseline; gap: 10px; padding: 7px 0; border-top: 1px solid var(--soft); }
  .home .hit b { font-weight: 600; }
  .home .hit span { color: var(--muted); }
  .home .hit .ref { margin-left: auto; font: 12px var(--mono); padding: 1px 6px; border: 1px solid var(--line); border-radius: 5px; color: var(--grape); }
  .home .src { margin-top: 8px; padding: 8px 10px; border-left: 2.5px solid var(--leaf); background: var(--leaf-tint); color: var(--lead); font-size: 13px; border-radius: 0 6px 6px 0; }
  .home .figcap { margin: 10px 4px 0; font-size: 12px; color: var(--muted); }
  .home .section { padding: 72px 0 0; }
  .home .sub { margin: 0 0 28px; color: var(--muted); max-width: 40rem; }
  .home .tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  .home a.tile { background: var(--card); border: 1.5px solid var(--line); border-radius: 16px; padding: 24px; display: grid; grid-template-columns: auto 1fr; align-items: center; column-gap: 16px; color: inherit; text-decoration: none; }
  .home a.tile:hover { border-color: var(--grape); }
  .home .tile h3, .home .tile p { grid-column: 1 / -1; }
  .home .tile svg { width: 40px; height: 40px; fill: none; stroke: var(--grape); stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
  .home .tile .n { display: block; font: 500 clamp(40px, 5vw, 60px)/1 var(--serif); letter-spacing: -0.02em; color: var(--grape); font-variant-numeric: tabular-nums; }
  .home .tile h3 { margin: 14px 0 4px; font-size: 19px; font-weight: 600; }
  .home .tile p { margin: 0; color: var(--lead); font-size: 15px; }
  .home .chips { display: flex; flex-wrap: wrap; gap: 10px; }
  .home .chip { padding: 10px 16px; border-radius: 99px; border: 1.5px solid var(--line); background: var(--card); color: var(--ink); font: inherit; font-size: 15px; text-align: left; cursor: pointer; }
  .home .chip::before { content: "\xAB"; color: var(--grape); }
  .home .chip::after { content: "\xBB"; color: var(--grape); }
  .home .chip:hover, .home .chip.copied { border-color: var(--grape); background: var(--tint); }
  .home .invite { margin-top: 72px; display: grid; grid-template-columns: 1fr auto; gap: 24px; align-items: center; padding: 32px; border-radius: 18px; background: var(--grape); color: var(--on-grape); }
  .home .invite h2 { font-size: 26px; margin: 0 0 4px; }
  .home .invite p { margin: 0; color: var(--on-grape); }
  .home .invite .btn { background: var(--on-grape); color: var(--grape); }
  @media (max-width: 900px) {
    .home .hero { grid-template-columns: 1fr; gap: 40px; padding-top: 32px; }
    .home .tiles { grid-template-columns: repeat(2, 1fr); }
    .home .invite { grid-template-columns: 1fr; }
  }
  @media (max-width: 560px) {
    .home .tiles { grid-template-columns: 1fr; }
    .home .btn { justify-content: center; }
  }
</style>
</head>
<body>
${body}
</body>
</html>
`;
}

// src/gortach/pages.ts
var STYLE = `<style>
  :root { --danger-tint: #f8e6e3; }
  html[data-theme="night"] { --danger-tint: #3a2220; }
  .g-bar { display: flex; align-items: baseline; gap: 16px; padding: 16px 0 4px; }
  .g-bar a.brand { font: 500 22px var(--serif); color: inherit; text-decoration: none; }
  .g-runs { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0; }
  .g-runs a { padding: 4px 10px; border: 1px solid var(--line); border-radius: 6px; color: inherit; text-decoration: none; background: var(--card); }
  .g-runs a[aria-current="page"] { border-color: var(--grape); font-weight: 600; }
  .g-tabs { display: flex; gap: 20px; margin: 8px 0 16px; border-bottom: 1px solid var(--line); }
  .g-tabs a { padding: 8px 2px; color: inherit; text-decoration: none; }
  .g-tabs a[aria-current="page"] { border-bottom: 2px solid var(--grape); font-weight: 600; }
  .g-meter { display: flex; align-items: center; gap: 10px; margin: 6px 0; }
  .g-meter .bar { flex: 1; max-width: 320px; height: 8px; background: var(--soft); border-radius: 4px; overflow: hidden; }
  .g-meter .bar i { display: block; height: 100%; background: var(--leaf); }
  .g-filter { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; margin: 12px 0; }
  .g-filter select, .g-filter button, .item input, .item select { font: inherit; padding: 4px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--card); color: var(--ink); }
  .item { padding: 14px 16px; margin: 12px 0; background: var(--card); border: 1px solid var(--line); border-left: 6px solid var(--line); border-radius: 10px; }
  .item.tone-ok { background: var(--leaf-tint); border-left-color: var(--leaf); }
  .item.tone-error { background: var(--danger-tint); border-left-color: var(--danger); }
  .vp { position: relative; overflow: hidden; height: clamp(260px, 48vh, 520px); margin: 10px 0 6px; border: 1px solid var(--line); background: #2c2824; cursor: grab; touch-action: none; user-select: none; }
  .vp.drag { cursor: grabbing; }
  .vp-in { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
  .vp-in img { display: block; max-width: none; pointer-events: none; }
  .vp-box { position: absolute; border: solid var(--danger); box-sizing: border-box; pointer-events: none; }
  .vp-zoom { position: absolute; right: 8px; top: 8px; display: flex; gap: 4px; }
  .vp-zoom button { width: 32px; padding: 2px 0; }
  .vp-tools { display: flex; gap: 12px; align-items: center; margin: 0 0 6px; }
  .vp-tools a { display: inline-block; padding: 5px 12px; border: 1px solid var(--line); border-radius: 6px; color: inherit; text-decoration: none; background: var(--card); }
  .item .noscan { color: var(--muted); font-style: italic; }
  .item h3 { margin: 0 0 6px; font: 600 15px var(--sans); }
  .item .read { font: 500 20px var(--serif); margin: 4px 0; }
  .item .meta { color: var(--muted); font-size: 14px; margin: 2px 0; }
  .item form { margin: 8px 0 0; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .item button, .g-record button { font: inherit; padding: 5px 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--card); color: var(--ink); cursor: pointer; }
  .item button.ok { border-color: var(--leaf); color: var(--leaf); }
  .item button.bad { border-color: var(--danger); color: var(--danger); }
  .g-record { margin: 12px 0; display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
  .g-record button { background: var(--grape); color: var(--on-grape); border-color: var(--grape); }
  .g-title { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px 20px; }
  .g-wipe { margin: 0; }
  .g-wipe button { font: inherit; padding: 5px 12px; border: 1px solid var(--danger); border-radius: 6px; background: var(--card); color: var(--danger); cursor: pointer; }
  .g-cases a { display: block; padding: 8px 0; }
</style>
`;
var ELEMENT_LABELS = {
  surname: "\u043F\u0440\u0456\u0437\u0432\u0438\u0449\u0435",
  given: "\u0456\u043C'\u044F",
  patronymic: "\u043F\u043E \u0431\u0430\u0442\u044C\u043A\u043E\u0432\u0456",
  place: "\u043C\u0456\u0441\u0446\u0435"
};
var STATUS_FILTER_LABELS = {
  open: "\u0432\u0456\u0434\u043A\u0440\u0438\u0442\u0456",
  confirmed: "\u043F\u0440\u0430\u0432\u0438\u043B\u044C\u043D\u043E",
  fixed: "\u0432\u0438\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043E",
  unknown: "\u043D\u0435 \u0447\u0438\u0442\u0430\u0454\u0442\u044C\u0441\u044F"
};
var STATUS_LABELS = {
  open: "\u0432\u0456\u0434\u043A\u0440\u0438\u0442\u0438\u0439",
  confirmed: "\u043F\u0440\u0430\u0432\u0438\u043B\u044C\u043D\u043E",
  fixed: "\u0432\u0438\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043E",
  unknown: "\u043D\u0435 \u0447\u0438\u0442\u0430\u0454\u0442\u044C\u0441\u044F"
};
function elementLabel(element) {
  return ELEMENT_LABELS[element] ?? element;
}
function routeOf(set) {
  return set === "doubt" ? "doubts" : "sample";
}
function caseHref(caseName, set, query2 = "") {
  return `/c/${encodeURIComponent(caseName)}/${routeOf(set)}${query2}`;
}
function shell(title, body) {
  const bar = `<div class="g-bar"><a class="brand" href="/">\u0413\u043E\u0440\u0442\u0430\u0447-\u0412\u0438\u043F\u0440\u0430\u0432\u043B\u044F\u0447</a><span class="fine">\u043F\u0435\u0440\u0435\u0433\u043B\u044F\u0434 \u0456\u043D\u0434\u0435\u043A\u0441\u0443\u0432\u0430\u043D\u043D\u044F</span></div>`;
  return page(
    "uk",
    `${title} \xB7 \u0413\u043E\u0440\u0442\u0430\u0447-\u0412\u0438\u043F\u0440\u0430\u0432\u043B\u044F\u0447`,
    `<div class="wrap">${bar}${body}</div>`,
    STYLE + VIEWPORT_SCRIPT
  );
}
function casesPage(cases) {
  const list = cases.length === 0 ? `<p>\u0423 \u043A\u043E\u0440\u0435\u043D\u0456 \u043D\u0435\u043C\u0430\u0454 \u0442\u0435\u043A \u0441\u043F\u0440\u0430\u0432.</p>` : `<div class="g-cases">${cases.map((name) => `<a href="/c/${encodeURIComponent(name)}/doubts">${esc(name)}</a>`).join("")}</div>`;
  return shell("\u0421\u043F\u0440\u0430\u0432\u0438", `<h1>\u0421\u043F\u0440\u0430\u0432\u0438</h1>${list}`);
}
function noDatabasePage(caseName) {
  return shell(
    caseName,
    `<h1>${esc(caseName)}</h1><p>\u0423 \u0446\u0456\u0439 \u0442\u0435\u0446\u0456 \u043D\u0435\u043C\u0430\u0454 \u0431\u0430\u0437\u0438 \u0441\u043F\u0440\u0430\u0432\u0438 (<code>case.sqlite</code>), \u0442\u043E\u0436 \u043F\u0435\u0440\u0435\u0433\u043B\u044F\u0434\u0430\u0442\u0438 \u043D\u0456\u0447\u043E\u0433\u043E. \u0411\u0430\u0437\u0443 \u0441\u0442\u0432\u043E\u0440\u044E\u0454 \u0456\u043D\u0434\u0435\u043A\u0441\u0443\u0432\u0430\u043D\u043D\u044F.</p><p><a href="/">\u2190 \u0434\u043E \u0441\u043F\u0440\u0430\u0432</a></p>`
  );
}
function errorPage(message, backHref) {
  return shell(
    "\u041F\u043E\u043C\u0438\u043B\u043A\u0430",
    `<h1>\u041D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044F</h1><p class="error">${esc(message)}</p><p>\u041D\u0456\u0447\u043E\u0433\u043E \u043D\u0435 \u0437\u043C\u0456\u043D\u0435\u043D\u043E. <a href="${esc(backHref)}">\u2190 \u043D\u0430\u0437\u0430\u0434</a></p>`
  );
}
function meter(reviewed, total) {
  const percent = total === 0 ? 0 : Math.round(reviewed / total * 100);
  return `<span class="bar"><i style="width:${String(percent)}%"></i></span><span>${String(reviewed)} / ${String(total)}</span>`;
}
function runQuery(run) {
  return run === null ? "" : `?run=${String(run)}`;
}
function tabs(caseName, active, doubts, sample, run) {
  const tab = (set, label, p) => `<a href="${esc(caseHref(caseName, set, runQuery(run)))}"${set === active ? ' aria-current="page"' : ""}>${label} ${String(p.reviewed)} / ${String(p.total)}</a>`;
  return `<nav class="g-tabs">${tab("doubt", "\u0421\u0443\u043C\u043D\u0456\u0432\u0438", doubts)}${tab("sample", "\u0412\u0438\u0431\u0456\u0440\u043A\u0430", sample)}</nav>`;
}
function hidden(name, value) {
  return `<input type="hidden" name="${name}" value="${esc(value)}">`;
}
function actionUrl(ctx, item, action) {
  return `/c/${encodeURIComponent(ctx.caseName)}/${routeOf(item.set)}/${String(item.id)}/${action}`;
}
function keep(ctx) {
  const run = ctx.run === null ? "" : hidden("run", String(ctx.run));
  return `${run}${hidden("f_element", ctx.filter.element ?? "")}${hidden("f_status", ctx.filter.status ?? "")}`;
}
var VIEWPORT_SCRIPT = `<script>
document.addEventListener("DOMContentLoaded", () => {
  const load = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const img = entry.target.querySelector("img");
      if (entry.isIntersecting && img && !img.src) img.src = img.dataset.src;
    }
  }, { rootMargin: "600px" });
  for (const vp of document.querySelectorAll(".vp")) {
    const inner = vp.querySelector(".vp-in");
    const frame = vp.querySelector(".vp-box");
    const d = vp.dataset;
    const sw = +d.sw, sh = +d.sh;
    const has = d.w !== undefined;
    const bx = has ? +d.x : 0, by = has ? +d.y : 0, bw = has ? +d.w : sw, bh = has ? +d.h : sh;
    let scale = 1, tx = 0, ty = 0;
    const apply = () => {
      inner.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + scale + ")";
      if (frame) frame.style.borderWidth = 2 / scale + "px";
    };
    const home = () => {
      const W = vp.clientWidth, H = vp.clientHeight;
      scale = has ? Math.min(W * 0.6 / bw, H * 0.6 / bh, 4) : Math.min(W / sw, H / sh);
      tx = W / 2 - (bx + bw / 2) * scale;
      ty = H / 2 - (by + bh / 2) * scale;
      apply();
    };
    const zoom = (k, cx, cy) => {
      const next = Math.min(8, Math.max(0.05, scale * k));
      tx = cx - (cx - tx) * next / scale;
      ty = cy - (cy - ty) * next / scale;
      scale = next;
      apply();
    };
    let last = null;
    vp.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button")) return;
      last = [e.clientX, e.clientY];
      vp.setPointerCapture(e.pointerId);
      vp.classList.add("drag");
    });
    vp.addEventListener("pointermove", (e) => {
      if (!last) return;
      tx += e.clientX - last[0];
      ty += e.clientY - last[1];
      last = [e.clientX, e.clientY];
      apply();
    });
    const stop = () => { last = null; vp.classList.remove("drag"); };
    vp.addEventListener("pointerup", stop);
    vp.addEventListener("pointercancel", stop);
    vp.addEventListener("wheel", (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = vp.getBoundingClientRect();
      zoom(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    for (const button of vp.querySelectorAll("button")) {
      button.addEventListener("click", () => {
        const W = vp.clientWidth, H = vp.clientHeight;
        if (button.dataset.act === "in") zoom(1.5, W / 2, H / 2);
        else if (button.dataset.act === "out") zoom(1 / 1.5, W / 2, H / 2);
        else home();
      });
    }
    home();
    load.observe(vp);
  }
});
</script>
`;
function scanHtml(ctx, item) {
  if (!ctx.hasScan(item.scanFile)) {
    return `<p class="noscan">\u0441\u043A\u0430\u043D\u0430 \u043D\u0435\u043C\u0430\u0454 \u0432 raw/ (${esc(item.scanFile)})</p>`;
  }
  const src = `/c/${encodeURIComponent(ctx.caseName)}/raw/${encodeURIComponent(item.scanFile)}`;
  const box = item.box;
  const place = box === null ? "" : ` data-x="${String(box.x)}" data-y="${String(box.y)}" data-w="${String(box.w)}" data-h="${String(box.h)}"`;
  const frame = box === null ? "" : `<div class="vp-box" style="left:${String(box.x)}px;top:${String(box.y)}px;width:${String(box.w)}px;height:${String(box.h)}px"></div>`;
  return `<div class="vp" data-sw="${String(item.scanWidth)}" data-sh="${String(item.scanHeight)}"${place}>
      <div class="vp-in" style="width:${String(item.scanWidth)}px;height:${String(item.scanHeight)}px">
        <img data-src="${esc(src)}" width="${String(item.scanWidth)}" height="${String(item.scanHeight)}" alt="\u0441\u043A\u0430\u043D ${esc(item.scan)}" draggable="false">${frame}</div>
      <div class="vp-zoom"><button type="button" data-act="out" title="\u043C\u0435\u043D\u0448\u0435">\u2212</button><button type="button" data-act="home" title="\u0434\u043E \u043C\u0456\u0441\u0446\u044F">\u25CE</button><button type="button" data-act="in" title="\u0431\u0456\u043B\u044C\u0448\u0435">+</button></div>
    </div>
    <div class="vp-tools"><a href="${esc(src)}" target="_blank" rel="noopener">\u0432\u0456\u0434\u043A\u0440\u0438\u0442\u0438 \u0441\u043A\u0430\u043D \u043F\u043E\u0432\u043D\u0456\u0441\u0442\u044E</a><span class="fine">\u0442\u044F\u0433\u043D\u0456\u0442\u044C, \u0449\u043E\u0431 \u043F\u043E\u0441\u0443\u043D\u0443\u0442\u0438; Ctrl + \u043A\u043E\u043B\u0435\u0441\u043E \u2014 \u043C\u0430\u0441\u0448\u0442\u0430\u0431</span></div>`;
}
function scanLink(item) {
  const label = `\u0441\u043A\u0430\u043D ${esc(item.scan)} \u2197`;
  return /^https?:\/\//.test(item.url) ? `<a href="${esc(item.url)}" target="_blank" rel="noopener">${label}</a>` : label;
}
function actions(ctx, item) {
  if (item.status !== "open") {
    return `<form method="post" action="${esc(actionUrl(ctx, item, "reopen"))}">${keep(ctx)}<button>\u0432\u0456\u0434\u043A\u0440\u0438\u0442\u0438 \u0437\u043D\u043E\u0432\u0443</button></form>`;
  }
  const status = `<form method="post" action="${esc(actionUrl(ctx, item, "status"))}">${keep(ctx)}
      <input name="note" placeholder="\u043F\u0440\u0438\u043C\u0456\u0442\u043A\u0430" size="20">
      <button class="ok" name="status" value="confirmed">\u043F\u0440\u0430\u0432\u0438\u043B\u044C\u043D\u043E</button>
      <button class="bad" name="status" value="unknown">\u043D\u0435 \u0447\u0438\u0442\u0430\u0454\u0442\u044C\u0441\u044F</button></form>`;
  const fix = item.editable ? `<form method="post" action="${esc(actionUrl(ctx, item, "fix"))}">${keep(ctx)}
        <input name="value" value="${esc(item.currentValue ?? "")}" size="22" aria-label="${esc(elementLabel(item.element))}">
        <button class="bad">\u0432\u0438\u043F\u0440\u0430\u0432\u0438\u0442\u0438</button></form>` : "";
  return status + fix;
}
function card(ctx, item) {
  const tone = reviewTone(item.status);
  const toneClass = tone === null ? "" : ` tone-${tone}`;
  const lines = [
    `<div class="read">${esc(item.readText ?? "\u2014")}</div>`,
    item.variants === null ? "" : `<div class="meta">\u0432\u0430\u0440\u0456\u0430\u043D\u0442\u0438: ${esc(item.variants)}</div>`,
    item.agentNote === null ? "" : `<div class="meta">\u0430\u0433\u0435\u043D\u0442: ${esc(item.agentNote)}</div>`,
    `<div class="meta">${scanLink(item)}</div>`,
    `<div class="meta">\u0441\u0442\u0430\u043D: <strong>${esc(STATUS_LABELS[item.status])}</strong>${item.note === null ? "" : ` \xB7 ${esc(item.note)}`}</div>`
  ];
  if (item.status !== "open" && item.currentValue !== null && item.currentValue !== item.readText) {
    lines.splice(1, 0, `<div class="meta">\u0437\u0430\u0440\u0430\u0437 \u0443 \u0431\u0430\u0437\u0456: ${esc(item.currentValue)}</div>`);
  }
  return `<article class="item${toneClass}" id="i${String(item.id)}">
    <h3>${esc(item.set === "doubt" ? `\u0441\u0443\u043C\u043D\u0456\u0432 ${String(item.id)}` : `\u0432\u0438\u0431\u0456\u0440\u043A\u0430 ${String(item.rank ?? item.id)}`)} \xB7 ${esc(elementLabel(item.element))}</h3>
    ${lines.join("")}${scanHtml(ctx, item)}${actions(ctx, item)}</article>`;
}
function filterForm(data) {
  const elements = data.doubts.byElement.map(
    (row) => `<option value="${esc(row.element)}"${data.filter.element === row.element ? " selected" : ""}>${esc(elementLabel(row.element))} ${String(row.reviewed)} / ${String(row.total)}</option>`
  ).join("");
  const statuses = REVIEW_STATUSES.map(
    (status) => `<option value="${status}"${data.filter.status === status ? " selected" : ""}>${STATUS_FILTER_LABELS[status]}</option>`
  ).join("");
  return `<form class="g-filter" method="get" action="${esc(caseHref(data.caseName, "doubt"))}">
    ${data.context.run === null ? "" : hidden("run", String(data.context.run))}
    <select name="element"><option value="">\u0443\u0441\u0456 \u0442\u0438\u043F\u0438</option>${elements}</select>
    <select name="status"><option value="">\u0443\u0441\u0456 \u0441\u0442\u0430\u043D\u0438</option>${statuses}</select>
    <button>\u043F\u043E\u043A\u0430\u0437\u0430\u0442\u0438</button></form>`;
}
function sampleHead(data) {
  if (data.sample.total === 0) return `<p>\u0412\u0438\u0431\u0456\u0440\u043A\u0443 \u0431\u0443\u0434\u0443\u044E\u0442\u044C \u043F\u0456\u0441\u043B\u044F \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043D\u044F \u043F\u0440\u043E\u0433\u043E\u043D\u0443.</p>`;
  const recorded = data.recorded === null ? "\u0432\u0456\u0434\u0441\u043E\u0442\u043E\u043A \u0449\u0435 \u043D\u0435 \u0437\u0430\u043F\u0438\u0441\u0430\u043D\u043E" : `\u0437\u0430\u043F\u0438\u0441\u0430\u043D\u043E: ${String(data.recorded.percent)} % (${String(data.recorded.errors)} \u0437 ${String(data.recorded.size)})`;
  return `<form class="g-record" method="post" action="/c/${encodeURIComponent(data.caseName)}/sample/rate">
      ${data.context.run === null ? "" : hidden("run", String(data.context.run))}<button>\u0417\u0430\u043F\u0438\u0441\u0430\u0442\u0438</button><span>\u0440\u043E\u0431\u0438\u0442\u044C \u0432\u0456\u0434\u043A\u0440\u0438\u0442\u0456 \u043C\u0456\u0441\u0446\u044F \xAB\u043F\u0440\u0430\u0432\u0438\u043B\u044C\u043D\u043E\xBB \u0439 \u0437\u0430\u043F\u0438\u0441\u0443\u0454 \u0432\u0456\u0434\u0441\u043E\u0442\u043E\u043A \u043F\u043E\u043C\u0438\u043B\u043E\u043A \u0443 <code>run-*.yaml</code></span>
      <span>${esc(recorded)}</span></form>`;
}
function runPicker(data) {
  if (data.runs.length < 2) return "";
  const links = data.runs.map((run) => {
    const label = [`\u041F\u0440\u043E\u0433\u0456\u043D ${String(run.id)}`, run.model, run.note ?? ""].filter(Boolean).join(" \xB7 ");
    return `<a href="${esc(caseHref(data.caseName, data.set, runQuery(run.id)))}"${run.id === data.run ? ' aria-current="page"' : ""} title="${esc(run.startedAt)}">${esc(label)}</a>`;
  }).join("");
  return `<nav class="g-runs" aria-label="\u041F\u0440\u043E\u0433\u043E\u043D\u0438">${links}</nav>`;
}
function casePage(data) {
  const active = data.set === "doubt" ? data.doubts : data.sample;
  const head = data.set === "doubt" ? filterForm(data) : sampleHead(data);
  const wipe = data.rawCount === 0 ? "" : `<form class="g-wipe" method="post" action="/c/${encodeURIComponent(data.caseName)}/raw/wipe" onsubmit="return confirm('\u0412\u0438\u0442\u0435\u0440\u0442\u0438 \u0432\u0441\u0456 \u0441\u043A\u0430\u043D\u0438 (${String(data.rawCount)}) \u0437 raw/ \u0446\u0456\u0454\u0457 \u0441\u043F\u0440\u0430\u0432\u0438? \u0421\u043A\u0430\u0447\u0430\u0442\u0438 \u0457\u0445 \u0437\u043D\u043E\u0432\u0443 \u043C\u043E\u0436\u043D\u0430, \u0430\u043B\u0435 \u0446\u0435 \u0434\u043E\u0432\u0433\u043E.')"><button class="bad">\u0412\u0438\u0442\u0435\u0440\u0442\u0438 \u0441\u043A\u0430\u043D\u0438 (${String(data.rawCount)})</button></form>`;
  const body = `<div class="g-title"><h1>${esc(data.caseName)}</h1>${wipe}</div>
    ${runPicker(data)}
    ${tabs(data.caseName, data.set, data.doubts, data.sample, data.context.run)}
    <div class="g-meter">${meter(active.reviewed, active.total)}</div>
    ${head}
    ${data.items.map((item) => card(data.context, item)).join("\n")}`;
  return shell(data.caseName, body);
}

// src/gortach/server.ts
var DATABASE_FILE = "case.sqlite";
var SCAN_NAME = /^[\w.-]+\.jpg$/;
var WHOLE_NUMBER = /^\d+$/;
var TEXT = "text/html; charset=utf-8";
var NotFound = class extends Error {
};
function send(res, status, type, body) {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}
function redirect(res, location) {
  res.writeHead(303, { location });
  res.end();
}
async function readForm(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buffer.length;
    if (size > 1e5) throw new Error("the request is too large");
    chunks.push(buffer);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}
function setOf(route) {
  if (route === "doubts") return "doubt";
  if (route === "sample") return "sample";
  return null;
}
function whole(value) {
  if (value === null || value === void 0 || !WHOLE_NUMBER.test(value.trim())) return void 0;
  return Number(value.trim());
}
function filterOf(params, prefix) {
  const element = params.get(`${prefix}element`) ?? "";
  const status = params.get(`${prefix}status`) ?? "";
  return {
    ...element === "" ? {} : { element },
    ...REVIEW_STATUSES.some((known) => known === status) ? { status } : {}
  };
}
function chooseRun(runs, value) {
  const latest = runs.at(-1);
  if (latest === void 0) return null;
  if (value === null || value === void 0 || value === "") return latest.id;
  const id = whole(value);
  if (id === void 0 || !runs.some((run) => run.id === id)) throw new NotFound();
  return id;
}
function shownRun(runs, run) {
  return runs.length > 1 ? run : null;
}
function query(filter, run) {
  const params = new URLSearchParams();
  if (run !== null) params.set("run", String(run));
  if (filter.element !== void 0) params.set("element", filter.element);
  if (filter.status !== void 0) params.set("status", filter.status);
  const text = params.toString();
  return text === "" ? "" : `?${text}`;
}
async function startGortach(options) {
  const server = createServer((req, res) => {
    void handle(options, req, res).catch((error) => {
      if (res.headersSent) {
        res.end();
      } else if (error instanceof NotFound) {
        send(res, 404, TEXT, errorPage("\u041D\u0435 \u0437\u043D\u0430\u0439\u0434\u0435\u043D\u043E.", "/"));
      } else {
        const message = error instanceof Error ? error.message : String(error);
        send(res, 400, TEXT, errorPage(message, req.headers.referer ?? "/"));
      }
    });
  });
  await new Promise((resolve) => {
    server.listen(options.port, options.host, () => {
      resolve();
    });
  });
  const address = server.address();
  const port2 = typeof address === "object" && address !== null ? address.port : options.port;
  return {
    port: port2,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    })
  };
}
async function handle(options, req, res) {
  const url = new URL(req.url ?? "/", "http://localhost");
  let path;
  try {
    path = url.pathname.split("/").filter((part) => part !== "").map(decodeURIComponent);
  } catch {
    throw new NotFound();
  }
  const method = req.method ?? "GET";
  if (path.length === 0 && method === "GET") {
    send(res, 200, TEXT, casesPage(listCases(options.root)));
    return;
  }
  const [prefix, caseName, section, ...rest] = path;
  if (prefix !== "c" || caseName === void 0 || section === void 0) throw new NotFound();
  if (!listCases(options.root).includes(caseName)) throw new NotFound();
  const caseDir = join2(options.root, caseName);
  if (section === "raw" && method === "GET") {
    const file = rest[0];
    if (file === void 0 || rest.length !== 1 || !SCAN_NAME.test(file)) throw new NotFound();
    const path2 = join2(caseDir, "raw", file);
    if (!existsSync2(path2)) throw new NotFound();
    send(res, 200, "image/jpeg", readFileSync(path2));
    return;
  }
  if (section === "raw" && method === "POST" && rest.length === 1 && rest[0] === "wipe") {
    wipeRaw(caseDir);
    redirect(res, caseHref(caseName, "doubt"));
    return;
  }
  const set = setOf(section);
  if (set === null) throw new NotFound();
  const databasePath = join2(caseDir, DATABASE_FILE);
  if (!existsSync2(databasePath)) {
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
function showCase(db, options, caseName, set, params) {
  const filter = set === "doubt" ? filterOf(params, "") : {};
  const runs = listRuns(db);
  const run = chooseRun(runs, params.get("run"));
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
    rawCount: rawFiles(join2(options.root, caseName)).length,
    recorded: recordedErrorRate(db, runId),
    context: {
      caseName,
      filter,
      run: shownRun(runs, run),
      hasScan: (file) => existsSync2(join2(options.root, caseName, "raw", file))
    }
  });
}
function act(db, caseDir, caseName, set, rest, form) {
  const filter = filterOf(form, "f_");
  const runs = listRuns(db);
  const run = chooseRun(runs, form.get("run"));
  if (run === null) throw new NotFound();
  const tab = caseHref(caseName, set, query(filter, shownRun(runs, run)));
  if (set === "sample" && rest.length === 1 && rest[0] === "rate") {
    recordErrorRate(db, run);
    return tab;
  }
  const id = whole(rest[0]);
  const action = rest[1];
  if (id === void 0 || action === void 0 || rest.length !== 2) throw new NotFound();
  const ref = { set, id };
  if (findItem(db, ref, run) === void 0) throw new NotFound();
  const note = form.get("note") ?? void 0;
  switch (action) {
    case "status": {
      const status = form.get("status");
      if (status !== "confirmed" && status !== "unknown") throw new Error("\u043D\u0435\u0432\u0456\u0434\u043E\u043C\u0438\u0439 \u0441\u0442\u0430\u043D");
      setStatus(db, ref, status, note);
      break;
    }
    case "fix": {
      const value = (form.get("value") ?? "").trim();
      if (value !== findItem(db, ref, run)?.currentValue) fixName(db, ref, value, note);
      break;
    }
    case "reopen":
      reopen(db, ref);
      break;
    default:
      throw new NotFound();
  }
  return tab;
}

// src/gortach/startup.ts
function startupMessage(info) {
  const port2 = String(info.port);
  return [
    `\u0413\u043E\u0440\u0442\u0430\u0447: http://127.0.0.1:${port2}/`,
    `\u0417 \u0456\u043D\u0448\u043E\u0457 \u043C\u0430\u0448\u0438\u043D\u0438: ssh -N -L ${port2}:127.0.0.1:${port2} ${info.ssh}`
  ].join("\n");
}

// src/gortach/cli.ts
var { values } = parseArgs({
  options: {
    root: { type: "string", default: "." },
    port: { type: "string", default: "8090" },
    ssh: { type: "string" }
  }
});
var port = Number(values.port);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error(`--port must be an integer from 0 to 65535, got ${values.port}`);
}
var gortach = await startGortach({ root: values.root, port, host: "127.0.0.1" });
console.log(
  startupMessage({
    port: gortach.port,
    ssh: values.ssh ?? `${userInfo().username}@${hostname()}`
  })
);
