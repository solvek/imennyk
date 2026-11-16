import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openCaseDb } from "../../src/indexing/db.ts";
import { type Reading } from "../../src/indexing/reading.ts";
import { startRun } from "../../src/indexing/run.ts";
import { addScans } from "../../src/indexing/scans.ts";
import { loginExpression } from "../../src/read/browser.ts";
import { alignSurnames, nearestSurname } from "../../src/read/dictionary.ts";
import { applyEnv, parseEnvFile } from "../../src/read/env.ts";
import { imageSize } from "../../src/read/image.ts";
import { openAiModel } from "../../src/read/openai.ts";
import { readScanNames } from "../../src/read/progress.ts";
import { parseReply, readPreparedScan } from "../../src/read/read.ts";
import { downloadUrl, driveFolderId, driveSource, folderSource } from "../../src/read/sources.ts";
import { EMPTY_STATE, nextState } from "../../src/read/state.ts";
import { marriageStrips } from "../../src/read/strips.ts";

const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function reading(): Reading {
  return {
    scan: "0007",
    year: 1884,
    scan_attributes: [],
    lines: [],
    places: [{ key: "here", name: "Пирятин", type: "settlement" }],
    households: [],
    events: [
      {
        key: "r1",
        type: "marriage",
        date: "1884-02-05",
        number: "1",
        place: "here",
        attributes: [],
        members: [
          {
            key: "g",
            main: true,
            given: "Іван",
            surname: "Тестенко",
            gender: "male",
            attributes: [],
          },
          {
            key: "b",
            given: "Євдокія",
            surname: "Вигадана",
            gender: "female",
            main: false,
            attributes: [],
          },
          {
            key: "pr",
            given: "Григорій",
            surname: "Священик",
            gender: "male",
            main: false,
            attributes: [],
          },
        ],
        ties: [
          { person: "b", other: "g", type: "spouse" },
          { person: "pr", other: "g", type: "officiant" },
        ],
      },
    ],
    doubts: [],
    dictionary: [],
  };
}

describe("image size and strips", () => {
  it("reads a png and a jpeg", () => {
    expect(imageSize(PNG_1x1)).toEqual({ width: 1, height: 1 });
    const jpeg = new Uint8Array(20);
    jpeg.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x00, 0x03, 0x20], 0);
    expect(imageSize(jpeg)).toEqual({ width: 800, height: 512 });
  });

  it("cuts a spread into six strips that stay on the page", () => {
    const strips = marriageStrips(3500, 2700);
    expect(strips.map((strip) => strip.name)).toEqual(["L1", "L2", "L3", "R1", "R2", "R3"]);
    for (const strip of strips) {
      expect(strip.x + strip.w).toBeLessThanOrEqual(3500);
      expect(strip.y + strip.h).toBeLessThanOrEqual(2700);
    }
  });
});

describe("the dictionary", () => {
  it("corrects one close surname and leaves an exact one and a far one", () => {
    expect(nearestSurname("Тестенко", ["Тестенко"])).toBeUndefined();
    expect(nearestSurname("Тестенка", ["Тестенко", "Вигаданий"])).toBe("Тестенко");
    expect(nearestSurname("Зовсім", ["Тестенко"])).toBeUndefined();
    const page = reading();
    const event = page.events[0];
    const groom = event?.members[0];
    if (event === undefined || groom === undefined) throw new Error("fixture");
    const corrected = alignSurnames(
      {
        ...page,
        events: [
          { ...event, members: [{ ...groom, surname: "Тестенка" }, ...event.members.slice(1)] },
        ],
      },
      ["Тестенко"],
    );
    expect(corrected.events[0]?.members[0]?.surname).toBe("Тестенко");
    expect(corrected.doubts[0]?.read).toBe("Тестенка");
    expect(corrected.doubts[0]?.variants).toBe("Тестенко");
  });
});

describe("state between pages", () => {
  it("keeps the last record and clears a pending line when the page has records", () => {
    const next = nextState({ ...EMPTY_STATE, pending: "обірваний запис" }, reading(), {});
    expect(next.year).toBe(1884);
    expect(next.lastDate).toBe("1884-02-05");
    expect(next.lastNumber).toBe("1");
    expect(next.place).toBe("Пирятин");
    expect(next.pending).toBeNull();
  });

  it("keeps a continuation the model still reports", () => {
    const next = nextState(EMPTY_STATE, reading(), { pending: "свідки на наступній" });
    expect(next.pending).toBe("свідки на наступній");
  });
});

describe("a model reply", () => {
  it("accepts a fenced wrapper", () => {
    const text =
      "```json\n" + JSON.stringify({ reading: reading(), carry: { pending: "далі" } }) + "\n```";
    const parsed = parseReply(text);
    expect(parsed.carry.pending).toBe("далі");
  });

  it("writes a page once, so the run already contains the scan", async () => {
    const db = openCaseDb(":memory:");
    addScans(db, [{ name: "0007", url: "u", width: 1000, height: 800 }]);
    const runId = startRun(db, {
      startedAt: "2026-11-16T00:00:00Z",
      model: "openai:gpt-6-sol",
      operator: "Тест",
    });
    const model = {
      id: "openai:gpt-6-sol",
      complete: () =>
        Promise.resolve({
          text: JSON.stringify({ reading: reading() }),
          usage: { inputTokens: 10, cachedTokens: 4, outputTokens: 3 },
        }),
    };
    const result = await readPreparedScan({
      db,
      runId,
      scan: { name: "0007", width: 1000, height: 800 },
      images: [{ name: "L1", mediaType: "image/jpeg", bytes: new Uint8Array() }],
      model,
      state: EMPTY_STATE,
      surnames: [],
      effort: "low",
    });
    expect(result.events).toBe(1);
    expect(readScanNames(db, runId).has("0007")).toBe(true);
    expect(result.state.lastDate).toBe("1884-02-05");
  });
});

describe("openai", () => {
  it("reads the text and retries a rate limit", async () => {
    const waits: number[] = [];
    let calls = 0;
    const fetchFn: typeof fetch = () => {
      calls += 1;
      if (calls === 1)
        return Promise.resolve(
          new Response("slow", { status: 429, headers: { "retry-after": "2" } }),
        );
      return Promise.resolve(
        new Response(
          JSON.stringify({
            output_text: '{"reading":{}}',
            usage: {
              input_tokens: 8,
              output_tokens: 2,
              input_tokens_details: { cached_tokens: 5 },
            },
          }),
          { status: 200 },
        ),
      );
    };
    const model = openAiModel({
      apiKey: "test",
      model: "gpt-6-sol",
      fetchFn,
      sleep: (ms) => {
        waits.push(ms);
        return Promise.resolve();
      },
    });
    const reply = await model.complete({
      instructions: "JSON",
      prompt: "page",
      images: [],
      effort: "low",
    });
    expect(reply.text).toBe('{"reading":{}}');
    expect(reply.usage.cachedTokens).toBe(5);
    expect(waits).toEqual([2000]);
  });
});

describe("where scans come from", () => {
  it("lists a folder in page order and does not fetch a file twice by name", async () => {
    const dir = mkdtempSync(join(tmpdir(), "imennyk-read-"));
    writeFileSync(join(dir, "10.png"), PNG_1x1);
    writeFileSync(join(dir, "2.png"), PNG_1x1);
    const source = folderSource(dir);
    const listed = await source.list();
    expect(listed.map((scan) => scan.name)).toEqual(["2", "10"]);
    const opened = await source.open(listed[0] ?? { name: "2", url: "" });
    expect(opened.width).toBe(1);
  });

  it("lists a Drive folder without downloading the files first", async () => {
    const calls: string[] = [];
    const fetchFn: typeof fetch = (input) => {
      const url = input instanceof URL ? input.href : typeof input === "string" ? input : input.url;
      calls.push(url);
      if (url.includes("oauth2")) {
        return Promise.resolve(
          new Response(JSON.stringify({ access_token: "tok" }), { status: 200 }),
        );
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            files: [
              { id: "a", name: "10.jpg", mimeType: "image/jpeg" },
              { id: "b", name: "2.jpg", mimeType: "image/jpeg" },
              { id: "c", name: "notes.txt", mimeType: "text/plain" },
            ],
          }),
          { status: 200 },
        ),
      );
    };
    const source = driveSource({
      folderId: "folder",
      clientId: "id",
      clientSecret: "secret",
      refreshToken: "refresh",
      fetchFn,
    });
    const listed = await source.list();
    expect(listed.map((scan) => scan.name)).toEqual(["2", "10"]);
    expect(calls.some((url) => url.includes("alt=media"))).toBe(false);
    expect(driveFolderId("https://drive.google.com/drive/folders/abc_DEF-1")).toBe("abc_DEF-1");
    expect(downloadUrl("https://drive.google.com/file/d/abc/view?usp=sharing")).toBe(
      "https://drive.google.com/uc?export=download&id=abc",
    );
  });
});

describe("env and login", () => {
  it("fills only what is missing and keeps a quote inside a password", () => {
    const env: Record<string, string | undefined> = { IMENNYK_OPENAI_KEY: "already" };
    applyEnv(parseEnvFile('IMENNYK_OPENAI_KEY=other\nIMENNYK_ANTHROPIC_KEY="k"\n# c\n'), env);
    expect(env.IMENNYK_OPENAI_KEY).toBe("already");
    expect(env.IMENNYK_ANTHROPIC_KEY).toBe("k");
    expect(loginExpression("a", 'p"w')).toContain('"p\\"w"');
  });
});
