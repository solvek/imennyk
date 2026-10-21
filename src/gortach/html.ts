import type { Locale } from "../core/locale.ts";
import { RU_UI_LOCALE_SCRIPT } from "./ru-ui-locale.ts";

/** Escape text for an HTML text node or a double-quoted attribute. */
export function esc(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function page(locale: Locale, title: string, body: string, head = ""): string {
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
  .shot img { display: block; width: 100%; height: auto; border: 1px solid var(--line); border-radius: 12px; background: var(--card); }
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
  .home .chip::before { content: "«"; color: var(--grape); }
  .home .chip::after { content: "»"; color: var(--grape); }
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
<script>${RU_UI_LOCALE_SCRIPT}</script>
${body}
</body>
</html>
`;
}
