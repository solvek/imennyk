// HTML of Gortach: the list of cases and the two tabs of a case. Pure functions of their input.
import { esc, page } from "../html.ts";
import { DOUBT_STATUSES, TIE_TYPES } from "../../genealogy/indexing/enums.ts";
import {
  reviewTone,
  type ItemFilter,
  type Progress,
  type ReviewItem,
  type ReviewSet,
  type TieCandidates,
} from "../../genealogy/indexing/review.ts";

const STYLE = `<style>
  :root { --danger-tint: #f8e6e3; }
  html[data-theme="night"] { --danger-tint: #3a2220; }
  .g-bar { display: flex; align-items: baseline; gap: 16px; padding: 16px 0 4px; }
  .g-bar a.brand { font: 500 22px var(--serif); color: inherit; text-decoration: none; }
  .g-tabs { display: flex; gap: 20px; margin: 8px 0 16px; border-bottom: 1px solid var(--line); }
  .g-tabs a { padding: 8px 2px; color: inherit; text-decoration: none; }
  .g-tabs a[aria-current="page"] { border-bottom: 2px solid var(--grape); font-weight: 600; }
  .g-meter { display: flex; align-items: center; gap: 10px; margin: 6px 0; }
  .g-meter .bar { flex: 1; max-width: 320px; height: 8px; background: var(--soft); border-radius: 4px; overflow: hidden; }
  .g-meter .bar i { display: block; height: 100%; background: var(--leaf); }
  .g-filter { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; margin: 12px 0; }
  .g-filter select, .g-filter button, .item input, .item select { font: inherit; padding: 4px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--card); color: var(--ink); }
  .item { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; padding: 14px 16px; margin: 12px 0; background: var(--card); border: 1px solid var(--line); border-left: 6px solid var(--line); border-radius: 10px; }
  .item.tone-ok { background: var(--leaf-tint); border-left-color: var(--leaf); }
  .item.tone-error { background: var(--danger-tint); border-left-color: var(--danger); }
  .item img { max-width: 100%; height: auto; border: 1px solid var(--line); background: #fff; }
  .item .nocrop { color: var(--muted); font-style: italic; }
  .item h3 { margin: 0 0 6px; font: 600 15px var(--sans); }
  .item .read { font: 500 20px var(--serif); margin: 4px 0; }
  .item .meta { color: var(--muted); font-size: 14px; margin: 2px 0; }
  .item form { margin: 8px 0 0; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .item button, .g-record button { font: inherit; padding: 5px 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--card); color: var(--ink); cursor: pointer; }
  .item button.ok { border-color: var(--leaf); color: var(--leaf); }
  .item button.bad { border-color: var(--danger); color: var(--danger); }
  .g-record { margin: 12px 0; display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
  .g-record button { background: var(--grape); color: var(--on-grape); border-color: var(--grape); }
  .g-cases a { display: block; padding: 8px 0; }
  @media (max-width: 720px) { .item { grid-template-columns: 1fr; } }
</style>
`;

const ELEMENT_LABELS: Record<string, string> = {
  surname: "прізвище",
  given: "ім'я",
  patronymic: "по батькові",
  age: "вік",
  gender: "стать",
  place: "місце",
  tie: "зв'язок",
  other: "інше",
};

const TIE_LABELS: Record<string, string> = {
  child: "дитина (child)",
  spouse: "подружжя (spouse)",
  godparent: "хрещений (godparent)",
  friend: "друг (friend)",
  witness: "свідок (witness)",
  officiant: "священник (officiant)",
  informant: "інформатор (informant)",
  mentioned: "згадана особа (mentioned)",
  kin: "рідня (kin)",
  relative: "родич (relative)",
};

const STATUS_FILTER_LABELS: Record<(typeof DOUBT_STATUSES)[number], string> = {
  open: "відкриті",
  confirmed: "правильно",
  fixed: "виправлено",
  unknown: "не читається / не знаю",
  tie_added: "зв'язок додано",
  tie_deleted: "зв'язок видалено",
};

function elementLabel(element: string): string {
  return ELEMENT_LABELS[element] ?? element;
}

/** A name part (or a sample place) is «unreadable»; anything else is «do not know». */
function unknownLabel(item: ReviewItem): string {
  return item.editable ? "не читається" : "не знаю";
}

function statusLabel(item: ReviewItem): string {
  switch (item.status) {
    case "open":
      return "відкритий";
    case "confirmed":
      return "правильно";
    case "fixed":
      return "виправлено";
    case "unknown":
      return unknownLabel(item);
    case "tie_added":
      return "зв'язок додано";
    case "tie_deleted":
      return "зв'язок видалено";
  }
}

export function routeOf(set: ReviewSet): "doubts" | "sample" {
  return set === "doubt" ? "doubts" : "sample";
}

export function caseHref(caseName: string, set: ReviewSet, query = ""): string {
  return `/c/${encodeURIComponent(caseName)}/${routeOf(set)}${query}`;
}

function shell(title: string, body: string): string {
  const bar = `<div class="g-bar"><a class="brand" href="/">Гортач</a><span class="fine">перегляд індексування</span></div>`;
  return page("uk", `${title} · Гортач`, `<div class="wrap">${bar}${body}</div>`, STYLE);
}

export function casesPage(cases: readonly string[]): string {
  const list =
    cases.length === 0
      ? `<p>У корені немає тек справ.</p>`
      : `<div class="g-cases">${cases
          .map((name) => `<a href="/c/${encodeURIComponent(name)}/doubts">${esc(name)}</a>`)
          .join("")}</div>`;
  return shell("Справи", `<h1>Справи</h1>${list}`);
}

export function noDatabasePage(caseName: string): string {
  return shell(
    caseName,
    `<h1>${esc(caseName)}</h1><p>У цій теці немає бази справи (<code>case.sqlite</code>), тож переглядати нічого. Базу створює індексування.</p><p><a href="/">← до справ</a></p>`,
  );
}

export function errorPage(message: string, backHref: string): string {
  return shell(
    "Помилка",
    `<h1>Не вдалося</h1><p class="error">${esc(message)}</p><p>Нічого не змінено. <a href="${esc(backHref)}">← назад</a></p>`,
  );
}

function meter(reviewed: number, total: number): string {
  const percent = total === 0 ? 0 : Math.round((reviewed / total) * 100);
  return `<span class="bar"><i style="width:${String(percent)}%"></i></span><span>${String(reviewed)} / ${String(total)}</span>`;
}

function tabs(caseName: string, active: ReviewSet, doubts: Progress, sample: Progress): string {
  const tab = (set: ReviewSet, label: string, p: Progress): string =>
    `<a href="${esc(caseHref(caseName, set))}"${set === active ? ' aria-current="page"' : ""}>${label} ${String(p.reviewed)} / ${String(p.total)}</a>`;
  return `<nav class="g-tabs">${tab("doubt", "Сумніви", doubts)}${tab("sample", "Вибірка", sample)}</nav>`;
}

export interface CardContext {
  readonly caseName: string;
  readonly filter: ItemFilter;
  readonly hasCrop: (file: string) => boolean;
  /** Candidates for «add a tie», for doubts about a tie. */
  readonly candidates: (doubtId: number) => TieCandidates | undefined;
}

function hidden(name: string, value: string): string {
  return `<input type="hidden" name="${name}" value="${esc(value)}">`;
}

function actionUrl(ctx: CardContext, item: ReviewItem, action: string): string {
  return `/c/${encodeURIComponent(ctx.caseName)}/${routeOf(item.set)}/${String(item.id)}/${action}`;
}

function keep(ctx: CardContext): string {
  return `${hidden("f_element", ctx.filter.element ?? "")}${hidden("f_status", ctx.filter.status ?? "")}`;
}

function cropHtml(ctx: CardContext, item: ReviewItem): string {
  if (item.boxFile !== null && ctx.hasCrop(item.boxFile)) {
    return `<img src="/c/${encodeURIComponent(ctx.caseName)}/box/${encodeURIComponent(item.boxFile)}" alt="вирізка" loading="lazy">`;
  }
  return `<p class="nocrop">вирізки немає</p>`;
}

function scanLink(item: ReviewItem): string {
  const label = `скан ${esc(item.scan)} ↗`;
  return /^https?:\/\//.test(item.url)
    ? `<a href="${esc(item.url)}" target="_blank" rel="noopener">${label}</a>`
    : label;
}

function tieForms(ctx: CardContext, item: ReviewItem): string {
  const ties = item.ties ?? [];
  const remove = ties
    .map(
      (tie) =>
        `<form method="post" action="${esc(actionUrl(ctx, item, "delete-tie"))}">${keep(ctx)}${hidden("tie", String(tie.id))}<span>${esc(tie.outgoing ? tie.type : `${tie.type} ←`)} · ${esc(tie.otherName)}</span><button class="bad">видалити зв'язок</button></form>`,
    )
    .join("");
  const options = ctx.candidates(item.id);
  const add =
    options === undefined
      ? ""
      : `<form method="post" action="${esc(actionUrl(ctx, item, "add-tie"))}">${keep(ctx)}
          <select name="type">${TIE_TYPES.map((type) => `<option value="${type}">${esc(TIE_LABELS[type] ?? type)}</option>`).join("")}</select>
          <select name="other">${options.candidates
            .map(
              (candidate) =>
                `<option value="${String(candidate.personId)}"${candidate.personId === options.defaultId ? " selected" : ""}>${esc(candidate.name)}${candidate.isHead ? " (голова двору)" : ""}</option>`,
            )
            .join("")}</select>
          <input name="relation" placeholder="relation (kin, relative)" size="14">
          <input name="up" placeholder="up" size="3" inputmode="numeric">
          <input name="down" placeholder="down" size="3" inputmode="numeric">
          <input name="note" placeholder="примітка" size="16">
          <button class="ok">додати зв'язок</button></form>`;
  return remove + add;
}

function actions(ctx: CardContext, item: ReviewItem): string {
  if (item.status !== "open") {
    return `<form method="post" action="${esc(actionUrl(ctx, item, "reopen"))}">${keep(ctx)}<button>відкрити знову</button></form>`;
  }
  const status = `<form method="post" action="${esc(actionUrl(ctx, item, "status"))}">${keep(ctx)}
      <input name="note" placeholder="примітка" size="20">
      <button class="ok" name="status" value="confirmed">правильно</button>
      <button class="bad" name="status" value="unknown">${unknownLabel(item)}</button></form>`;
  const fix = item.editable
    ? `<form method="post" action="${esc(actionUrl(ctx, item, "fix"))}">${keep(ctx)}
        <input name="value" value="${esc(item.currentValue ?? "")}" size="22" aria-label="${esc(elementLabel(item.element))}">
        <button class="bad">виправити</button></form>`
    : "";
  return status + fix + (item.element === "tie" && item.set === "doubt" ? tieForms(ctx, item) : "");
}

export function card(ctx: CardContext, item: ReviewItem): string {
  const tone = reviewTone(item.status);
  const toneClass = tone === null ? "" : ` tone-${tone}`;
  const lines = [
    `<div class="read">${esc(item.readText ?? "—")}</div>`,
    item.variants === null ? "" : `<div class="meta">варіанти: ${esc(item.variants)}</div>`,
    item.agentNote === null ? "" : `<div class="meta">агент: ${esc(item.agentNote)}</div>`,
    `<div class="meta">${scanLink(item)}</div>`,
    `<div class="meta">стан: <strong>${esc(statusLabel(item))}</strong>${item.note === null ? "" : ` · ${esc(item.note)}`}</div>`,
  ];
  if (item.status !== "open" && item.currentValue !== null && item.currentValue !== item.readText) {
    lines.splice(1, 0, `<div class="meta">зараз у базі: ${esc(item.currentValue)}</div>`);
  }
  return `<article class="item${toneClass}" id="i${String(item.id)}">
    <div>${cropHtml(ctx, item)}</div>
    <div><h3>${esc(item.set === "doubt" ? `сумнів ${String(item.id)}` : `вибірка ${String(item.id)}`)} · ${esc(elementLabel(item.element))}</h3>
    ${lines.join("")}${actions(ctx, item)}</div></article>`;
}

export interface CasePage {
  readonly caseName: string;
  readonly set: ReviewSet;
  readonly items: readonly ReviewItem[];
  readonly doubts: Progress;
  readonly sample: Progress;
  readonly filter: ItemFilter;
  readonly recorded: {
    readonly percent: number;
    readonly errors: number;
    readonly size: number;
  } | null;
  readonly context: CardContext;
}

function filterForm(data: CasePage): string {
  const elements = data.doubts.byElement
    .map(
      (row) =>
        `<option value="${esc(row.element)}"${data.filter.element === row.element ? " selected" : ""}>${esc(elementLabel(row.element))} ${String(row.reviewed)} / ${String(row.total)}</option>`,
    )
    .join("");
  const statuses = DOUBT_STATUSES.map(
    (status) =>
      `<option value="${status}"${data.filter.status === status ? " selected" : ""}>${STATUS_FILTER_LABELS[status]}</option>`,
  ).join("");
  return `<form class="g-filter" method="get" action="${esc(caseHref(data.caseName, "doubt"))}">
    <select name="element"><option value="">усі типи</option>${elements}</select>
    <select name="status"><option value="">усі стани</option>${statuses}</select>
    <button>показати</button></form>`;
}

function sampleHead(data: CasePage): string {
  if (data.sample.total === 0) return `<p>Вибірку будують після завершення прогону.</p>`;
  const recorded =
    data.recorded === null
      ? "відсоток ще не записано"
      : `записано: ${String(data.recorded.percent)} % (${String(data.recorded.errors)} з ${String(data.recorded.size)})`;
  return `<form class="g-record" method="post" action="/c/${encodeURIComponent(data.caseName)}/sample/rate">
      <button>Записати</button><span>робить відкриті місця «правильно» й записує відсоток помилок у <code>run-*.yaml</code></span>
      <span>${esc(recorded)}</span></form>`;
}

export function casePage(data: CasePage): string {
  const active = data.set === "doubt" ? data.doubts : data.sample;
  const head = data.set === "doubt" ? filterForm(data) : sampleHead(data);
  const body = `<h1>${esc(data.caseName)}</h1>
    ${tabs(data.caseName, data.set, data.doubts, data.sample)}
    <div class="g-meter">${meter(active.reviewed, active.total)}</div>
    ${head}
    ${data.items.map((item) => card(data.context, item)).join("\n")}`;
  return shell(data.caseName, body);
}
