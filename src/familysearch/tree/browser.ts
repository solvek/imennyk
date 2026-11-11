// A TreeFetcher that asks FamilySearch from inside the logged-in Chrome of the host
// (skills/imennyk/references/familysearch-scans.md). The session never leaves the browser: no
// cookie or token is read; a tab on familysearch.org calls the same `/service/…` addresses the
// site itself calls, and only the JSON replies come back.
import { z } from "zod";
import type { TreeFetcher } from "./crawl.ts";

const TAB = z.object({ id: z.string(), webSocketDebuggerUrl: z.string() });
const EVALUATED = z.object({
  result: z.object({
    result: z.object({ value: z.unknown().optional() }).optional(),
    exceptionDetails: z.unknown().optional(),
  }),
});

const SERVICE = "/service/tree";
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface BrowserOptions {
  /** DevTools address of the Chrome of the host. */
  readonly devtools?: string;
  /** Pause between two calls, in milliseconds, so that the site is not hammered. */
  readonly pauseMs?: number;
}

/** Opens a tab on `startPerson` and gives `use` a fetcher; the tab is closed afterwards. */
export async function withFamilySearch<T>(
  startPerson: string,
  use: (fetcher: TreeFetcher) => Promise<T>,
  options: BrowserOptions = {},
): Promise<T> {
  const devtools = options.devtools ?? "http://127.0.0.1:9222";
  const pauseMs = options.pauseMs ?? 120;
  const tab = TAB.parse(
    await (await fetch(`${devtools}/json/new?about:blank`, { method: "PUT" })).json(),
  );
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener("open", () => {
      resolve();
    });
    ws.addEventListener("error", () => {
      reject(new Error("cannot connect to Chrome DevTools"));
    });
  });
  let counter = 0;
  const pending = new Map<number, (message: unknown) => void>();
  ws.addEventListener("message", (event: MessageEvent) => {
    const message = z
      .object({ id: z.number().optional() })
      .loose()
      .safeParse(JSON.parse(String(event.data)));
    if (message.success && message.data.id !== undefined) {
      pending.get(message.data.id)?.(message.data);
      pending.delete(message.data.id);
    }
  });
  const send = (method: string, params: Record<string, unknown> = {}): Promise<unknown> =>
    new Promise((resolve) => {
      counter += 1;
      pending.set(counter, resolve);
      ws.send(JSON.stringify({ id: counter, method, params }));
    });
  const evaluate = async (expression: string): Promise<unknown> => {
    const reply = EVALUATED.parse(
      await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }),
    );
    if (reply.result.exceptionDetails !== undefined) {
      throw new Error(`browser error: ${JSON.stringify(reply.result.exceptionDetails)}`);
    }
    return reply.result.result?.value;
  };
  /** `null` for 404; an error for anything else but success. */
  const call = async (path: string): Promise<unknown> => {
    await sleep(pauseMs);
    const reply = z
      .object({ status: z.number(), body: z.unknown() })
      .parse(
        await evaluate(
          `(async()=>{const r=await fetch(${JSON.stringify(path)},{headers:{Accept:"application/json"}});` +
            `const t=await r.text();let b=null;try{b=JSON.parse(t)}catch{}return {status:r.status,body:b}})()`,
        ),
      );
    if (reply.status === 404) return null;
    if (reply.status === 401 || reply.status === 403) {
      throw new Error(
        `FamilySearch answered ${String(reply.status)}: the session is gone, log in again (noVNC)`,
      );
    }
    if (reply.status !== 200)
      throw new Error(`FamilySearch answered ${String(reply.status)} for ${path}`);
    return reply.body;
  };

  try {
    await send("Page.enable");
    await send("Page.navigate", {
      url: `https://www.familysearch.org/uk/tree/pedigree/fanchart/${startPerson}`,
    });
    // The page is ready when the same-origin API answers.
    let ready = false;
    for (let attempt = 0; attempt < 30 && !ready; attempt += 1) {
      await sleep(1000);
      try {
        ready = (await call(`${SERVICE}/tree-data/v8/person/${startPerson}/summary`)) !== null;
      } catch {
        ready = false;
      }
    }
    if (!ready) throw new Error("FamilySearch did not open: no session or a security check");
    return await use({
      pedigree: (root) =>
        call(
          `${SERVICE}/tree-data/r9/portrait-pedigree/${root}?includeMarriages=true&numGenerations=8`,
        ),
      details: (id) => call(`${SERVICE}/tree-data/v8/person/${id}/details`),
      sourceRefs: (id) => call(`${SERVICE}/tf/person/${id}/entityref?version=2`),
      sourceLinks: (ids) => call(`${SERVICE}/links/sources/${ids.join(",")}?readExternalData=true`),
    });
  } finally {
    ws.close();
    await fetch(`${devtools}/json/close/${tab.id}`);
  }
}
