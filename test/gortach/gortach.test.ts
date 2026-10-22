import {
  existsSync,
  mkdirSync,
  readdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { parse } from "yaml";
import { openCaseDb } from "../../src/genealogy/indexing/db.ts";
import { ingestReading } from "../../src/genealogy/indexing/ingest.ts";
import { startRun } from "../../src/genealogy/indexing/run.ts";
import { buildSample } from "../../src/genealogy/indexing/sample.ts";
import { startGortach, type Gortach } from "../../src/web/gortach/server.ts";

const box = (y: number) => ({ x: 10, y, w: 100, h: 15 });
const CASE = "case-a";

let root: string;
let server: Gortach;
let base: string;

function dbPath(name = CASE): string {
  return join(root, name, "case.sqlite");
}

function build(name: string, withSample: boolean): void {
  mkdirSync(join(root, name), { recursive: true });
  const db = openCaseDb(dbPath(name));
  db.exec(
    "insert into scan (name, url, width, height) values ('n_1', 'https://example.org/n_1', 2000, 2000)",
  );
  const run = startRun(db, { startedAt: "2026-10-22T10:00:00Z", model: "test-model" });
  ingestReading(db, run, {
    scan: "n_1",
    year: 1912,
    households: [
      {
        key: "h1",
        members: [
          { key: "t", head: true, given: "Тарас", surname: "Петренко", box: box(10) },
          { key: "s", given: "Соломонія", surname: "Петренко", box: box(30) },
          { key: "c", given: "Петро", surname: "Петренко", box: box(50) },
        ],
        ties: [{ person: "c", other: "t", type: "child" }],
      },
    ],
    doubts: [
      { element: "surname", person: "t", read: "Петренко", variants: "Петренко", box: box(10) },
      { element: "tie", person: "s", read: "Соломонія", box: box(30) },
      { element: "tie", person: "c", read: "Петро", box: box(50) },
      { element: "age", person: "s", read: "57", box: box(30) },
    ],
  });
  if (withSample) buildSample(db, "seed", 3);
  db.close();
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "gortach-"));
  build(CASE, true);
  build("case-b", false);
  build("case-c", false);
  mkdirSync(join(root, "case-c", "raw", "keep-folder"), { recursive: true });
  for (const name of ["n_1.jpg", "n_2.jpg", "n_3.jpg"]) {
    writeFileSync(join(root, "case-c", "raw", name), "fake-jpeg");
  }
  mkdirSync(join(root, "notes"));
  writeFileSync(join(root, "readme.md"), "not a case");
  // The full scan is in raw/ of the first case only.
  mkdirSync(join(root, CASE, "raw"));
  writeFileSync(join(root, CASE, "raw", "n_1.jpg"), "fake-jpeg");
  server = await startGortach({ root, port: 0, host: "127.0.0.1" });
  base = `http://127.0.0.1:${String(server.port)}`;
});

afterAll(async () => {
  await server.close();
});

function get(path: string): Promise<Response> {
  return fetch(`${base}${path}`, { redirect: "manual" });
}

function post(path: string, fields: Record<string, string> = {}): Promise<Response> {
  return fetch(`${base}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
}

function rows(sql: string): Record<string, unknown>[] {
  const db = openCaseDb(dbPath());
  try {
    return db
      .prepare(sql)
      .all()
      .map((row) => ({ ...row }));
  } finally {
    db.close();
  }
}

/** The `<article>` of one item, from its id to the next card. */
function articleOf(html: string, id: number): string {
  const start = html.indexOf(`id="i${String(id)}"`);
  expect(start).toBeGreaterThan(0);
  const from = html.lastIndexOf("<article", start);
  return html.slice(from, html.indexOf("</article>", start));
}

describe("cases", () => {
  it("lists the folders of the root and nothing else", async () => {
    const html = await (await get("/")).text();
    expect(html).toContain(CASE);
    expect(html).toContain("case-b");
    expect(html).toContain("notes");
    expect(html).not.toContain("readme.md");
  });

  it("answers 404 for names that are not folders of the root", async () => {
    for (const path of ["/c/nope/doubts", "/c/..%2F/doubts", "/c/%2E%2E/doubts", "/c/%2F/doubts"]) {
      expect((await get(path)).status).toBe(404);
    }
    expect((await get(`/c/${CASE}/other`)).status).toBe(404);
    expect((await get("/elsewhere")).status).toBe(404);
  });

  it("explains a folder without a database and does not create one", async () => {
    const response = await get("/c/notes/doubts");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("немає бази справи");
    expect(existsSync(join(root, "notes", "case.sqlite"))).toBe(false);
    expect((await post("/c/notes/doubts/1/reopen")).status).toBe(404);
    expect(existsSync(join(root, "notes", "case.sqlite"))).toBe(false);
  });
});

describe("scans", () => {
  it("serves a scan from raw/ and refuses other names", async () => {
    const response = await get(`/c/${CASE}/raw/n_1.jpg`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(await response.text()).toBe("fake-jpeg");
    for (const name of ["n_2.jpg", "case.sqlite", "..%2Fcase.sqlite", "x.png"]) {
      expect((await get(`/c/${CASE}/raw/${name}`)).status).toBe(404);
    }
  });
});

describe("wiping scans", () => {
  it("offers the button with the number of files only when there are some", async () => {
    expect(await (await get(`/c/${CASE}/doubts`)).text()).toContain("Витерти скани (1)");
    expect(await (await get("/c/case-b/doubts")).text()).not.toContain("Витерти скани");
  });

  it("deletes the files of raw/ of this case only", async () => {
    const response = await post("/c/case-c/raw/wipe");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/c/case-c/doubts");
    expect(readdirSync(join(root, "case-c", "raw"))).toEqual(["keep-folder"]);
    expect(existsSync(join(root, CASE, "raw", "n_1.jpg"))).toBe(true);
    expect(existsSync(dbPath("case-c"))).toBe(true);
    expect(await (await get("/c/case-c/doubts")).text()).not.toContain("Витерти скани");
  });

  it("refuses names that are not cases and other methods", async () => {
    expect((await post("/c/..%2F/raw/wipe")).status).toBe(404);
    expect((await post("/c/nope/raw/wipe")).status).toBe(404);
    expect((await get(`/c/${CASE}/raw/wipe`)).status).toBe(404);
    expect(existsSync(join(root, CASE, "raw", "n_1.jpg"))).toBe(true);
  });
});

describe("pages", () => {
  it("shows the doubts with progress, the scan link, and a viewport on the scan", async () => {
    const html = await (await get(`/c/${CASE}/doubts`)).text();
    expect(html).toContain("Сумніви 0 / 4");
    expect(html).toContain("Вибірка 0 / 3");
    expect(html).toContain('href="https://example.org/n_1" target="_blank" rel="noopener"');
    expect(html).toContain(
      'class="vp" data-sw="2000" data-sh="2000" data-x="10" data-y="10" data-w="100" data-h="15"',
    );
    expect(html).toContain('data-src="/c/case-a/raw/n_1.jpg"');
    expect(html).toContain(
      '<a href="/c/case-a/raw/n_1.jpg" target="_blank" rel="noopener">відкрити скан повністю</a>',
    );
    expect(html).not.toContain("boxes");
  });

  it("says that the scan is missing from raw/", async () => {
    const html = await (await get("/c/case-b/doubts")).text();
    expect(html).toContain("скана немає в raw/");
    expect(html).not.toContain('class="vp"');
  });

  it("filters doubts by element and state", async () => {
    const html = await (await get(`/c/${CASE}/doubts?element=tie`)).text();
    expect(html.match(/<article/g)).toHaveLength(2);
    const none = await (await get(`/c/${CASE}/doubts?element=tie&status=fixed`)).text();
    expect(none.match(/<article/g)).toBeNull();
  });

  it("offers «delete tie» only to a person with ties, and «add tie» with the nearest head", async () => {
    const html = await (await get(`/c/${CASE}/doubts?element=tie`)).text();
    const [withoutTie, withTie] = [articleOf(html, 2), articleOf(html, 3)];
    expect(withoutTie).not.toContain("видалити зв'язок");
    expect(withTie).toContain("видалити зв'язок");
    expect(withoutTie).toContain("додати зв'язок");
    expect(withoutTie).toMatch(
      /<option value="\d+" selected>Тарас Петренко \(голова двору\)<\/option>/,
    );
  });

  it("tells that the sample is built after the run", async () => {
    const html = await (await get("/c/case-b/sample")).text();
    expect(html).toContain("Вибірку будують після завершення прогону");
    expect(html).not.toContain("Записати");
  });

  it("shows the sample with a record button", async () => {
    const html = await (await get(`/c/${CASE}/sample`)).text();
    expect(html).toContain("Записати");
    expect(html).toContain("відсоток ще не записано");
    expect(html.match(/<article/g)).toHaveLength(3);
  });
});

describe("actions", () => {
  it("fixes a surname: 303 back to the card, database changed, red card", async () => {
    const response = await post(`/c/${CASE}/doubts/1/fix`, { value: "Заицевскій", note: "ok" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`/c/${CASE}/doubts`);
    expect(rows("select surname from person where given = 'Тарас'")).toEqual([
      { surname: "Заицевскій" },
    ]);
    expect(rows("select status, resolution from doubt where id = 1")).toEqual([
      { status: "fixed", resolution: "ok" },
    ]);
    const html = await (await get(`/c/${CASE}/doubts`)).text();
    expect(articleOf(html, 1)).toContain("tone-error");
    expect(articleOf(html, 1)).toContain("відкрити знову");
  });

  it("keeps the filter when it goes back", async () => {
    const response = await post(`/c/${CASE}/doubts/4/status`, {
      status: "confirmed",
      f_element: "age",
      f_status: "open",
    });
    expect(response.headers.get("location")).toBe(`/c/${CASE}/doubts?element=age&status=open`);
    const html = await (await get(`/c/${CASE}/doubts`)).text();
    expect(articleOf(html, 4)).toContain("tone-ok");
  });

  it("opens a reviewed item again", async () => {
    expect((await post(`/c/${CASE}/doubts/4/reopen`)).status).toBe(303);
    expect(rows("select status from doubt where id = 4")).toEqual([{ status: "open" }]);
    const html = await (await get(`/c/${CASE}/doubts`)).text();
    expect(articleOf(html, 4)).not.toMatch(/tone-(ok|error)/);
  });

  it("shows an error page and changes nothing when the value is refused", async () => {
    const before = rows("select * from person order by id");
    const response = await post(`/c/${CASE}/doubts/2/fix`, { value: "Зай…" });
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("a name must be a full variant");
    expect(rows("select * from person order by id")).toEqual(before);
  });

  it("does not change a value that is saved as it is", async () => {
    const response = await post(`/c/${CASE}/sample/1/fix`, { value: "Петренко" });
    expect(response.status).toBe(303);
    expect(rows("select status from sample where rank = 1")).toEqual([{ status: "open" }]);
  });

  it("fixes a sample place and colours it red", async () => {
    await post(`/c/${CASE}/sample/2/fix`, { value: "Тимощукъ" });
    const html = await (await get(`/c/${CASE}/sample`)).text();
    expect(articleOf(html, 2)).toContain("tone-error");
    expect(rows("select status from sample where rank = 2")).toEqual([{ status: "fixed" }]);
  });

  it("adds and deletes a tie", async () => {
    const head = Number(rows("select id from person where given = 'Тарас'")[0]?.id);
    const added = await post(`/c/${CASE}/doubts/2/add-tie`, { type: "child", other: String(head) });
    expect(added.status).toBe(303);
    expect(rows("select type, other_id from tie order by id desc limit 1")).toEqual([
      { type: "child", other_id: head },
    ]);
    const self = Number(rows("select id from person where given = 'Петро'")[0]?.id);
    const refused = await post(`/c/${CASE}/doubts/3/add-tie`, {
      type: "child",
      other: String(self),
    });
    expect(refused.status).toBe(400);
    const tie = Number(
      rows("select id from tie where person_id = (select id from person where given = 'Петро')")[0]
        ?.id,
    );
    expect((await post(`/c/${CASE}/doubts/3/delete-tie`, { tie: String(tie) })).status).toBe(303);
    expect(rows("select count(*) as n from tie where id = " + String(tie))).toEqual([{ n: 0 }]);
    expect(rows("select id, status from doubt where id in (2, 3) order by id")).toEqual([
      { id: 2, status: "tie_added" },
      { id: 3, status: "tie_deleted" },
    ]);
  });

  it("records the error rate: open places turn green and the metafile is written", async () => {
    expect((await post(`/c/${CASE}/sample/rate`)).status).toBe(303);
    expect(rows("select distinct status from sample order by status")).toEqual([
      { status: "confirmed" },
      { status: "fixed" },
    ]);
    const html = await (await get(`/c/${CASE}/sample`)).text();
    expect(articleOf(html, 1)).toContain("tone-ok");
    expect(articleOf(html, 2)).toContain("tone-error");
    const yamlFile = join(root, CASE, "run-2026-10-22T10-00-00Z.yaml");
    const yaml = z
      .object({ wer: z.number(), sample_errors: z.number(), sample_size: z.number() })
      .parse(parse(readFileSync(yamlFile, "utf8")));
    expect(yaml).toEqual({ wer: 33.3, sample_errors: 1, sample_size: 3 });
    expect(html).toContain("записано: 33.3 % (1 з 3)");
  });

  it("answers 404 to an unknown item or action", async () => {
    expect((await post(`/c/${CASE}/doubts/99/reopen`)).status).toBe(404);
    expect((await post(`/c/${CASE}/doubts/1/bogus`)).status).toBe(404);
    expect((await post(`/c/${CASE}/sample/1/add-tie`)).status).toBe(404);
  });
});
