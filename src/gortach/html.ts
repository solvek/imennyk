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
${head}<style>
  body { margin: 0; background: #f7f6f3; color: #1c1b19; font: 16px/1.5 ui-sans-serif, system-ui, sans-serif; }
  a { color: #5b3a78; }
  .bar { display: flex; align-items: center; gap: 16px; padding: 14px 16px; }
  .brand { display: flex; align-items: center; gap: 8px; color: inherit; text-decoration: none; font-weight: 500; }
  .session { margin-left: auto; display: flex; align-items: center; gap: 12px; font-size: 14px; }
  .queue { color: #a3352b; font-weight: 600; }
  .session form { margin: 0; }
  .session button { font: inherit; color: #5b3a78; background: none; border: 0; padding: 0; cursor: pointer; }
  .langs { position: relative; }
  .langs summary { display: flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: 6px; font-weight: 600; letter-spacing: 0.04em; list-style: none; cursor: pointer; user-select: none; }
  .langs summary::-webkit-details-marker { display: none; }
  .langs summary::after { content: ""; border: 4px solid transparent; border-top-color: currentColor; border-bottom-width: 0; }
  .langs summary:hover, .langs[open] summary { background: #eeeae4; }
  .langs nav { position: absolute; right: 0; top: calc(100% + 4px); z-index: 10; min-width: 10rem; display: flex; flex-direction: column; background: #fff; border: 1px solid #e6e2da; border-radius: 8px; box-shadow: 0 4px 16px rgb(0 0 0 / 0.08); overflow: hidden; }
  .langs nav a { display: flex; align-items: baseline; gap: 12px; padding: 8px 12px; color: inherit; text-decoration: none; }
  .langs nav a + a { border-top: 1px solid #eeeae4; }
  .langs nav a:hover { background: #f7f6f3; }
  .langs nav a[aria-current="true"] { background: #1c1b19; color: #fff; pointer-events: none; }
  .langs .code { width: 1.8em; color: #5e5a55; font-size: 12px; font-weight: 600; letter-spacing: 0.06em; }
  .langs a[aria-current="true"] .code { color: inherit; }
  .google { display: inline-flex; align-items: center; gap: 10px; margin-top: 16px; padding: 10px 16px; border: 1px solid #dadce0; border-radius: 4px; background: #fff; color: #1f1f1f; font-weight: 500; text-decoration: none; }
  .fine { color: #5e5a55; font-size: 13px; }
  .mark { width: 28px; height: 28px; display: block; }
  .wrap { max-width: 40rem; margin: 0 auto; padding: 8px 16px 48px; }
  .sheet { background: #fff; border: 1px solid #e6e2da; border-radius: 12px; padding: 20px 16px 8px; }
  .place-map { position: relative; margin: 12px 0 16px; border: 1px solid #e6e2da; border-radius: 12px; overflow: hidden; background: #eeeae4; }
  .place-map-canvas { height: 14rem; width: 100%; }
  .place-map-fs { position: absolute; z-index: 1000; top: 8px; right: 8px; padding: 6px 10px; border: 1px solid #e6e2da; border-radius: 8px; background: #fff; color: #5b3a78; font: inherit; font-size: 13px; font-weight: 500; cursor: pointer; }
  .place-map-css-fs { position: fixed; inset: 0; z-index: 10000; margin: 0; border-radius: 0; border: 0; }
  .place-map-css-fs .place-map-canvas { height: 100%; }
  html.place-map-lock { overflow: hidden; }
  h1 { font-size: 32px; font-weight: 500; line-height: 1.15; margin: 32px 0 8px; }
  h2 { color: #5b3a78; font-size: 22px; font-weight: 500; line-height: 1.2; margin: 28px 0 8px; }
  .kicker { color: #5b3a78; font-size: 13px; margin: 0 0 8px; }
  .meta, .aside { color: #5e5a55; }
  .meta { margin: 0; }
  .row, .item { padding: 8px 0; border-top: 1px solid #eeeae4; }
  .row { display: flex; justify-content: space-between; gap: 16px; }
  .aside { text-align: right; }
  .facts { margin: 4px 0 0; }
  ol, ul { margin: 8px 0 0; padding-left: 1.2rem; }
  code { font-family: ui-monospace, monospace; }
  .shot { margin: 12px 0 0; }
  .shot img { display: block; width: 100%; height: auto; border: 1px solid #e6e2da; border-radius: 12px; background: #fff; }
  .shot figcaption { color: #5e5a55; font-size: 13px; margin-top: 6px; }
  .addr { display: inline-flex; align-items: center; gap: 4px; }
  .copy { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: #5b3a78; cursor: pointer; }
  .copy svg { width: 16px; height: 16px; display: none; }
  .copy .idle { display: block; }
  .copy.copied .idle { display: none; }
  .copy.copied .ok { display: block; }
  .note { white-space: pre-wrap; }
  .md p { margin: 0 0 8px; }
  .md p:last-child { margin-bottom: 0; }
  .md ul, .md ol { margin: 0 0 8px; }
  .md blockquote { margin: 0 0 8px; padding-left: 10px; border-left: 3px solid #e6e2da; }
  .md pre, .md code { font-family: ui-monospace, monospace; }
  .md pre { overflow-x: auto; }
  .report { margin: 12px 0 0; font-size: 14px; }
  .form { margin: 8px 0 16px; }
  .form label { display: block; margin-top: 16px; font-weight: 500; }
  .form .fine, .form .error { margin: 2px 0 0; }
  .form input, .form textarea { box-sizing: border-box; width: 100%; margin-top: 6px; padding: 8px 10px; border: 1px solid #e6e2da; border-radius: 8px; background: #fff; color: inherit; font: inherit; }
  .form textarea { resize: vertical; }
  .form button { margin-top: 20px; padding: 10px 18px; border: 0; border-radius: 8px; background: #5b3a78; color: #fff; font: inherit; font-weight: 500; cursor: pointer; }
  .error { color: #a3352b; font-size: 14px; }
  .trap { position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden; }
  .foot { max-width: 40rem; margin: 0 auto; padding: 0 16px 32px; font-size: 13px; display: flex; gap: 16px; flex-wrap: wrap; }
</style>
</head>
<body>
<script>${RU_UI_LOCALE_SCRIPT}</script>
${body}
</body>
</html>
`;
}
