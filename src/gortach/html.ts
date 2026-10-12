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

export function page(locale: Locale, title: string, body: string): string {
  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/logo.svg" type="image/svg+xml">
<style>
  body { margin: 0; background: #f7f6f3; color: #1c1b19; font: 16px/1.5 ui-sans-serif, system-ui, sans-serif; }
  a { color: #5b3a78; }
  .bar { display: flex; align-items: center; gap: 16px; padding: 14px 16px; }
  .brand { display: flex; align-items: center; gap: 8px; color: inherit; text-decoration: none; font-weight: 500; }
  .session { margin-left: auto; display: flex; align-items: center; gap: 12px; font-size: 14px; }
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
  h1 { font-size: 32px; font-weight: 500; line-height: 1.15; margin: 0 0 8px; }
  h2 { color: #5b3a78; font-size: 13px; font-weight: 500; margin: 22px 0 0; }
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
