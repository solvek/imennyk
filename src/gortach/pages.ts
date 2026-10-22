// HTML of Gortach: the list of cases and the two tabs of a case. Pure functions of their input.
import { esc, page } from "../html.ts";
import { REVIEW_STATUSES } from "../../genealogy/indexing/enums.ts";
import {
  reviewTone,
  type ItemFilter,
  type Progress,
  type ReviewItem,
  type ReviewSet,
  type ReviewStatus,
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

const ELEMENT_LABELS: Record<string, string> = {
  surname: "прізвище",
  given: "ім'я",
  patronymic: "по батькові",
  place: "місце",
};

const STATUS_FILTER_LABELS: Record<ReviewStatus, string> = {
  open: "відкриті",
  confirmed: "правильно",
  fixed: "виправлено",
  unknown: "не читається",
};

const STATUS_LABELS: Record<ReviewStatus, string> = {
  open: "відкритий",
  confirmed: "правильно",
  fixed: "виправлено",
  unknown: "не читається",
};

function elementLabel(element: string): string {
  return ELEMENT_LABELS[element] ?? element;
}

export function routeOf(set: ReviewSet): "doubts" | "sample" {
  return set === "doubt" ? "doubts" : "sample";
}

export function caseHref(caseName: string, set: ReviewSet, query = ""): string {
  return `/c/${encodeURIComponent(caseName)}/${routeOf(set)}${query}`;
}

function shell(title: string, body: string): string {
  const bar = `<div class="g-bar"><a class="brand" href="/">Гортач-Виправляч</a><span class="fine">перегляд індексування</span></div>`;
  return page(
    "uk",
    `${title} · Гортач-Виправляч`,
    `<div class="wrap">${bar}${body}</div>`,
    STYLE + VIEWPORT_SCRIPT,
  );
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
  /** Whether the full scan is in `raw/`. */
  readonly hasScan: (file: string) => boolean;
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

const VIEWPORT_SCRIPT = `<script>
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

/** A viewport on the full scan, placed at the box and movable by dragging, with a link to the scan. */
function scanHtml(ctx: CardContext, item: ReviewItem): string {
  if (!ctx.hasScan(item.scanFile)) {
    return `<p class="noscan">скана немає в raw/ (${esc(item.scanFile)})</p>`;
  }
  const src = `/c/${encodeURIComponent(ctx.caseName)}/raw/${encodeURIComponent(item.scanFile)}`;
  const box = item.box;
  const place =
    box === null
      ? ""
      : ` data-x="${String(box.x)}" data-y="${String(box.y)}" data-w="${String(box.w)}" data-h="${String(box.h)}"`;
  const frame =
    box === null
      ? ""
      : `<div class="vp-box" style="left:${String(box.x)}px;top:${String(box.y)}px;width:${String(box.w)}px;height:${String(box.h)}px"></div>`;
  return `<div class="vp" data-sw="${String(item.scanWidth)}" data-sh="${String(item.scanHeight)}"${place}>
      <div class="vp-in" style="width:${String(item.scanWidth)}px;height:${String(item.scanHeight)}px">
        <img data-src="${esc(src)}" width="${String(item.scanWidth)}" height="${String(item.scanHeight)}" alt="скан ${esc(item.scan)}" draggable="false">${frame}</div>
      <div class="vp-zoom"><button type="button" data-act="out" title="менше">−</button><button type="button" data-act="home" title="до місця">◎</button><button type="button" data-act="in" title="більше">+</button></div>
    </div>
    <div class="vp-tools"><a href="${esc(src)}" target="_blank" rel="noopener">відкрити скан повністю</a><span class="fine">тягніть, щоб посунути; Ctrl + колесо — масштаб</span></div>`;
}

function scanLink(item: ReviewItem): string {
  const label = `скан ${esc(item.scan)} ↗`;
  return /^https?:\/\//.test(item.url)
    ? `<a href="${esc(item.url)}" target="_blank" rel="noopener">${label}</a>`
    : label;
}

function actions(ctx: CardContext, item: ReviewItem): string {
  if (item.status !== "open") {
    return `<form method="post" action="${esc(actionUrl(ctx, item, "reopen"))}">${keep(ctx)}<button>відкрити знову</button></form>`;
  }
  const status = `<form method="post" action="${esc(actionUrl(ctx, item, "status"))}">${keep(ctx)}
      <input name="note" placeholder="примітка" size="20">
      <button class="ok" name="status" value="confirmed">правильно</button>
      <button class="bad" name="status" value="unknown">не читається</button></form>`;
  const fix = item.editable
    ? `<form method="post" action="${esc(actionUrl(ctx, item, "fix"))}">${keep(ctx)}
        <input name="value" value="${esc(item.currentValue ?? "")}" size="22" aria-label="${esc(elementLabel(item.element))}">
        <button class="bad">виправити</button></form>`
    : "";
  return status + fix;
}

export function card(ctx: CardContext, item: ReviewItem): string {
  const tone = reviewTone(item.status);
  const toneClass = tone === null ? "" : ` tone-${tone}`;
  const lines = [
    `<div class="read">${esc(item.readText ?? "—")}</div>`,
    item.variants === null ? "" : `<div class="meta">варіанти: ${esc(item.variants)}</div>`,
    item.agentNote === null ? "" : `<div class="meta">агент: ${esc(item.agentNote)}</div>`,
    `<div class="meta">${scanLink(item)}</div>`,
    `<div class="meta">стан: <strong>${esc(STATUS_LABELS[item.status])}</strong>${item.note === null ? "" : ` · ${esc(item.note)}`}</div>`,
  ];
  if (item.status !== "open" && item.currentValue !== null && item.currentValue !== item.readText) {
    lines.splice(1, 0, `<div class="meta">зараз у базі: ${esc(item.currentValue)}</div>`);
  }
  return `<article class="item${toneClass}" id="i${String(item.id)}">
    <h3>${esc(item.set === "doubt" ? `сумнів ${String(item.id)}` : `вибірка ${String(item.id)}`)} · ${esc(elementLabel(item.element))}</h3>
    ${lines.join("")}${scanHtml(ctx, item)}${actions(ctx, item)}</article>`;
}

export interface CasePage {
  readonly caseName: string;
  readonly set: ReviewSet;
  readonly items: readonly ReviewItem[];
  readonly doubts: Progress;
  readonly sample: Progress;
  readonly filter: ItemFilter;
  /** Files in `raw/`. */
  readonly rawCount: number;
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
  const statuses = REVIEW_STATUSES.map(
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
  const wipe =
    data.rawCount === 0
      ? ""
      : `<form class="g-wipe" method="post" action="/c/${encodeURIComponent(data.caseName)}/raw/wipe" onsubmit="return confirm('Витерти всі скани (${String(data.rawCount)}) з raw/ цієї справи? Скачати їх знову можна, але це довго.')"><button class="bad">Витерти скани (${String(data.rawCount)})</button></form>`;
  const body = `<div class="g-title"><h1>${esc(data.caseName)}</h1>${wipe}</div>
    ${tabs(data.caseName, data.set, data.doubts, data.sample)}
    <div class="g-meter">${meter(active.reviewed, active.total)}</div>
    ${head}
    ${data.items.map((item) => card(data.context, item)).join("\n")}`;
  return shell(data.caseName, body);
}
