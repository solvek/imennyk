/** Escape text for an HTML text node or a double-quoted attribute. */
export function esc(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="icon" href="/logo.svg" type="image/svg+xml">
<style>
  body { margin: 0; background: #f7f6f3; color: #1c1b19; font: 16px/1.5 ui-sans-serif, system-ui, sans-serif; }
  a { color: #5b3a78; }
  .bar { display: flex; align-items: center; padding: 14px 16px; }
  .brand { display: flex; align-items: center; gap: 8px; color: inherit; text-decoration: none; font-weight: 500; }
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
</style>
</head>
<body>
${body}
</body>
</html>
`;
}
