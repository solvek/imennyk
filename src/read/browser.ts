// Chromium over the DevTools protocol. The browser is the one already listening, or one this
// process starts. Login, when the site needs it, uses `IMENNYK_SITE_USER` and `IMENNYK_SITE_PASSWORD`.
// Cookies stay in the browser profile of the case, so the next start is already signed in.

import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { isRecord, parseJsonText } from "./json.ts";
import { type ScanSource, urlSource } from "./sources.ts";

const versionSchema = z.object({ webSocketDebuggerUrl: z.string() });

interface Pending {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
}

interface Session {
  call(
    method: string,
    params?: Readonly<Record<string, unknown>>,
    sessionId?: string,
  ): Promise<unknown>;
  close(): void;
}

/** The script that signs in when the page has a password field. Values are JSON literals. */
export function loginExpression(user: string, password: string): string {
  return `(() => {
    const user = ${JSON.stringify(user)};
    const password = ${JSON.stringify(password)};
    const pass = document.querySelector("input[type=password]");
    if (!pass || !pass.form) return "no-password";
    const field = pass.form.querySelector("input[type=email], input[type=text], input[name=username], input[name=login]");
    if (field) field.value = user;
    pass.value = password;
    pass.form.requestSubmit();
    return "submitted";
  })()`;
}

/** The script that lists the images of the page. */
export const COLLECT_IMAGES = `(() => {
  const out = [];
  const seen = new Set();
  for (const el of document.querySelectorAll("a[href], img[src]")) {
    const href = el.href || el.src || "";
    if (!/\\.(jpe?g|png|webp)(\\?|$)/i.test(href)) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    const file = decodeURIComponent(href.split("/").pop().split("?")[0]);
    out.push({ name: file.replace(/\\.[^.]+$/, ""), url: href });
  }
  return out;
})()`;

const linkSchema = z.array(z.object({ name: z.string().min(1), url: z.string().min(1) }));

function messageText(data: unknown): string {
  if (typeof data === "string") return data;
  if (data instanceof Uint8Array) return Buffer.from(data).toString("utf8");
  return "";
}

function connect(wsUrl: string): Promise<Session> {
  const ws = new WebSocket(wsUrl);
  const pending = new Map<number, Pending>();
  let next = 1;
  const session: Session = {
    call(method, params, sessionId) {
      const id = next;
      next += 1;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        const message: Record<string, unknown> = { id, method };
        if (params !== undefined) message.params = params;
        if (sessionId !== undefined) message.sessionId = sessionId;
        ws.send(JSON.stringify(message));
      });
    },
    close() {
      ws.close();
    },
  };
  return new Promise((resolve, reject) => {
    ws.addEventListener("open", () => {
      resolve(session);
    });
    ws.addEventListener("error", () => {
      reject(new Error(`the browser at ${wsUrl} did not connect`));
    });
    ws.addEventListener("message", (event) => {
      const text = messageText(event.data as unknown);
      if (text === "") return;
      let body: unknown;
      try {
        body = parseJsonText(text);
      } catch {
        return;
      }
      if (!isRecord(body) || typeof body.id !== "number") return;
      const waiter = pending.get(body.id);
      if (waiter === undefined) return;
      pending.delete(body.id);
      if (body.error !== undefined) {
        waiter.reject(new Error("the browser refused a command"));
        return;
      }
      waiter.resolve(body.result);
    });
  });
}

async function debuggerUrl(endpoint: string, fetchFn: typeof fetch): Promise<string> {
  const response = await fetchFn(`${endpoint.replace(/\/$/u, "")}/json/version`);
  if (!response.ok) throw new Error(`no browser at ${endpoint} (HTTP ${String(response.status)})`);
  return versionSchema.parse(parseJsonText(await response.text())).webSocketDebuggerUrl;
}

export interface BrowserOptions {
  /** `http://127.0.0.1:9222` */
  readonly endpoint: string;
  readonly pageUrl: string;
  readonly user?: string;
  readonly password?: string;
  readonly fetchFn?: typeof fetch;
  readonly sleep?: (ms: number) => Promise<void>;
}

/**
 * Opens `pageUrl` in the browser at `endpoint`, signs in when a user is given and the page asks
 * for a password, and returns the images linked from the page. Downloading uses the browser's
 * cookies, so a page that is only visible when signed in still yields its files.
 */
export async function browserSource(options: BrowserOptions): Promise<ScanSource> {
  const fetchFn = options.fetchFn ?? fetch;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const session = await connect(await debuggerUrl(options.endpoint, fetchFn));
  try {
    const created = z
      .object({ targetId: z.string() })
      .parse(await session.call("Target.createTarget", { url: "about:blank" }));
    const attached = z
      .object({ sessionId: z.string() })
      .parse(
        await session.call("Target.attachToTarget", { targetId: created.targetId, flatten: true }),
      );
    const id = attached.sessionId;
    await session.call("Page.enable", {}, id);
    await session.call("Runtime.enable", {}, id);
    await session.call("Network.enable", {}, id);
    await session.call("Page.navigate", { url: options.pageUrl }, id);
    await sleep(2500);
    if (options.user !== undefined && options.password !== undefined) {
      await session.call(
        "Runtime.evaluate",
        { expression: loginExpression(options.user, options.password), returnByValue: true },
        id,
      );
      await sleep(2500);
    }
    const collected = z
      .object({ result: z.object({ value: z.unknown() }) })
      .parse(
        await session.call(
          "Runtime.evaluate",
          { expression: COLLECT_IMAGES, returnByValue: true },
          id,
        ),
      );
    const links = linkSchema.parse(collected.result.value);
    const cookies = z
      .object({ cookies: z.array(z.object({ name: z.string(), value: z.string() })) })
      .parse(await session.call("Network.getCookies", { urls: [options.pageUrl] }, id));
    const header = cookies.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
    const withCookies: typeof fetch = (input, init) => {
      const headers = new Headers(init?.headers);
      if (header !== "") headers.set("cookie", header);
      return fetchFn(input, { ...init, headers });
    };
    return urlSource(links, withCookies);
  } finally {
    session.close();
  }
}

const BROWSERS = ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable"];

/** Starts Chromium with a profile in the case directory when nothing is listening yet. */
export function launchChromium(options: {
  readonly port: number;
  readonly profileDir: string;
  readonly binary?: string;
}): ChildProcess {
  mkdirSync(options.profileDir, { recursive: true });
  const binary = options.binary ?? BROWSERS[0] ?? "chromium";
  return spawn(
    binary,
    [
      "--headless=new",
      `--remote-debugging-port=${String(options.port)}`,
      `--user-data-dir=${options.profileDir}`,
      "--no-first-run",
      "--no-default-browser-check",
    ],
    { stdio: "ignore" },
  );
}

/** The profile Chromium keeps for one case, so a login survives the next start. */
export function chromiumProfile(caseDir: string): string {
  return join(caseDir, ".chromium");
}

/** True when something already answers the DevTools port. */
export async function browserIsUp(
  endpoint: string,
  fetchFn: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const response = await fetchFn(`${endpoint.replace(/\/$/u, "")}/json/version`);
    return response.ok;
  } catch {
    return false;
  }
}
