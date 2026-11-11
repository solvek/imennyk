// Built by `pnpm build:skill` from src/; do not edit by hand.
import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);
import {
  readingSchema
} from "./chunk-HRLE6GLS.mjs";
import {
  localOperatorPath,
  readOperator,
  requireOperator,
  require_dist,
  writeOperator
} from "./chunk-MP7VAO3J.mjs";
import {
  __toESM,
  external_exports,
  inTransaction,
  openCaseDb,
  runSummary,
  selectRows,
  startRun
} from "./chunk-A32FA3X5.mjs";

// src/indexing/cli.ts
var import_yaml = __toESM(require_dist(), 1);
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";

// src/indexing/dump.ts
import { DatabaseSync } from "node:sqlite";
function dumpCaseDb(path) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const tables = selectRows(
      db,
      external_exports.object({ name: external_exports.string() }),
      "select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name"
    );
    const lines = [];
    for (const { name } of tables) {
      lines.push(`-- ${name}`);
      for (const row of db.prepare(`select * from "${name}" order by 1, 2`).all()) {
        lines.push(JSON.stringify({ ...row }));
      }
    }
    return `${lines.join("\n")}
`;
  } finally {
    db.close();
  }
}

// src/indexing/hints.ts
var NAME_KINDS = ["given", "patronymic", "surname"];
function parseNameKind(value) {
  if (value === void 0) return void 0;
  const kind = NAME_KINDS.find((candidate) => candidate === value);
  if (kind === void 0) {
    throw new Error(`kind must be given, patronymic or surname: ${value}`);
  }
  return kind;
}
var dictionaryRow = external_exports.object({
  kind: external_exports.string(),
  word: external_exports.string(),
  canon: external_exports.string().nullable(),
  note: external_exports.string().nullable()
});
var nameRow = external_exports.object({ text: external_exports.string(), count: external_exports.number() });
function caseHints(db, options = {}) {
  const kinds = options.kind === void 0 ? NAME_KINDS : [options.kind];
  const dictionary = selectRows(
    db,
    dictionaryRow,
    `select kind, word, canon, note from dict_entry
      ${options.kind === void 0 ? "" : "where kind = ?"} order by kind, word`,
    options.kind === void 0 ? [] : [options.kind]
  );
  const names = kinds.flatMap(
    (kind) => (
      // `kind` is one of the three column names of `person`, never user text.
      selectRows(
        db,
        nameRow,
        `select ${kind} as text, count(*) as count from person where ${kind} is not null
        group by ${kind} order by count(*) desc, ${kind}`
      ).map((row) => ({ kind, text: row.text, count: row.count }))
    )
  );
  return { dictionary, names };
}
var KIND_TITLES = {
  given: "\u0406\u043C\u0435\u043D\u0430",
  patronymic: "\u041F\u043E \u0431\u0430\u0442\u044C\u043A\u043E\u0432\u0456",
  surname: "\u041F\u0440\u0456\u0437\u0432\u0438\u0449\u0430"
};
function formatHints(hints) {
  const lines = [`# \u0421\u043B\u043E\u0432\u043D\u0438\u043A \u0441\u043F\u0440\u0430\u0432\u0438 (${String(hints.dictionary.length)})`];
  for (const entry of hints.dictionary) {
    lines.push([entry.kind, entry.word, entry.canon ?? "", entry.note ?? ""].join("	"));
  }
  for (const kind of NAME_KINDS) {
    const names = hints.names.filter((name) => name.kind === kind);
    if (names.length === 0) continue;
    lines.push("", `# ${KIND_TITLES[kind]}, \u0440\u0456\u0437\u043D\u0438\u0445: ${String(names.length)}`);
    for (const name of names) lines.push(`${String(name.count)}	${name.text}`);
  }
  return `${lines.join("\n")}
`;
}

// src/indexing/compact.ts
var ROW_HEIGHT = 92;
function fail(line, message) {
  throw new Error(`line ${String(line)}: ${message}`);
}
function opt(value) {
  const text = value?.trim();
  return text === void 0 || text === "" ? void 0 : text;
}
function compactToReading(text, options) {
  let scan;
  let year;
  const places = [];
  let currentPlace;
  const cols = /* @__PURE__ */ new Map();
  let page;
  let section;
  let pendingCont;
  const scanNotes = [];
  const households = [];
  const doubts = [];
  const counters = { m: options.start.m, f: options.start.f };
  let last;
  let current;
  let continued = false;
  let persons = 0;
  text.split("\n").forEach((raw, index) => {
    const n = index + 1;
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) return;
    const [word = "", ...restParts] = line.split(/\s+/);
    const rest = restParts.join(" ");
    if (/^\d/.test(word)) {
      if (page === void 0 || !cols.has(page)) fail(n, "a row needs `cols` and `page` before it");
      const [yRaw = "", role = "", g = "", given, patronymic, surname, age, serial, note] = line.split(";").map((part) => part.trim());
      const yParts = yRaw.split("-").map(Number);
      const yFrom = yParts[0];
      const yTo = yParts[1] ?? yParts[0];
      if (yFrom === void 0 || yTo === void 0 || !Number.isFinite(yFrom) || !Number.isFinite(yTo)) {
        fail(n, `bad y \xAB${yRaw}\xBB`);
      }
      const gender = g === "m" ? "male" : g === "f" ? "female" : void 0;
      if (gender === void 0) fail(n, `gender must be m or f, not \xAB${g}\xBB`);
      const [x0, x1] = cols.get(page) ?? [0, 0];
      const centre = (yFrom + yTo) / 2;
      const half = Math.max(ROW_HEIGHT / 2, (yTo - yFrom) / 2 + 10);
      const box = {
        x: x0,
        y: Math.max(0, Math.round(centre - half)),
        w: x1 - x0,
        h: Math.round(half * 2),
        origin: "crop"
      };
      const printedSerial = opt(serial);
      const counted = printedSerial !== "-";
      if (counted) {
        if (gender === "male") counters.m += 1;
        else counters.f += 1;
      }
      if (printedSerial !== void 0 && counted) {
        const value = Number(printedSerial);
        if (!Number.isInteger(value)) fail(n, `bad serial \xAB${printedSerial}\xBB`);
        if (gender === "male") counters.m = value;
        else counters.f = value;
      }
      const ageValue = opt(age);
      const member = {
        key: `p${String(persons)}`,
        head: role === "H",
        gender,
        box,
        attributes: counted ? [{ type: "serial", value: String(gender === "male" ? counters.m : counters.f) }] : []
      };
      for (const part of [given, patronymic, surname]) {
        if (part !== void 0 && /[A-Za-z]/.test(part))
          fail(n, `Latin letters in a name: \xAB${part}\xBB`);
      }
      const g1 = opt(given);
      const p1 = opt(patronymic);
      const s1 = opt(surname);
      if (g1 !== void 0) member.given = g1;
      if (p1 !== void 0) member.patronymic = p1;
      if (s1 !== void 0) member.surname = s1;
      if (ageValue !== void 0) member.age = /^\d+$/.test(ageValue) ? Number(ageValue) : ageValue;
      for (const part of (note ?? "").split("|")) {
        const piece = part.trim();
        if (piece === "") continue;
        if (piece.startsWith("occ:")) {
          member.attributes.push({ type: "occupation", value: piece.slice(4).trim() });
        } else if (piece.startsWith("rel:")) {
          member.attributes.push({ type: "religion", value: piece.slice(4).trim() });
        } else member.attributes.push({ type: "note", value: piece });
      }
      persons += 1;
      last = member;
      if (role === "H") {
        const number = Math.max(1, Math.ceil(counters.m / 4));
        const household = {
          key: `h${String(households.length + 1)}`,
          number: String(number),
          attributes: [{ type: "note", value: "\u041D\u043E\u043C\u0435\u0440 \u0434\u0432\u043E\u0440\u0443 \u0432\u0438\u0432\u0435\u0434\u0435\u043D\u043E: \u0431\u0456\u043B\u044F \u0434\u0432\u043E\u0440\u0443 \u043D\u0435 \u043D\u0430\u0434\u0440\u0443\u043A\u043E\u0432\u0430\u043D\u043E" }],
          members: [member],
          ties: [],
          box,
          ...currentPlace === void 0 ? {} : { place: currentPlace }
        };
        if (section !== void 0) household.attributes.push({ type: "status", value: section });
        households.push(household);
        current = { household, head: member };
        continued = false;
      } else {
        if (current === void 0) {
          if (pendingCont === void 0) fail(n, "a row without head needs `cont` before it");
          const target = pendingCont;
          const household2 = {
            key: `h${String(households.length + 1)}`,
            attributes: [],
            members: [],
            ties: [],
            continues: { scan: target.scan, household: target.household },
            box
          };
          households.push(household2);
          current = { household: household2 };
          continued = true;
        }
        const { household } = current;
        household.members.push(member);
        if (household.box !== void 0) {
          const top = Math.min(household.box.y, box.y);
          const bottom = Math.max(household.box.y + household.box.h, box.y + box.h);
          household.box = { ...household.box, y: top, h: bottom - top };
        }
        const headRef = continued ? "@head" : current.head?.key;
        if (headRef === void 0) fail(n, "household without head");
        const add = (tie) => {
          household.ties.push(tie);
        };
        const spouseRef = continued ? pendingCont?.spouse === true && current.wife === void 0 ? "@spouse" : current.wife?.key : current.wife?.key;
        if (role === "W") {
          add({ person: member.key, other: headRef, type: "spouse" });
          current.wife ??= member;
        } else if (role === "S" || role === "D" || role === "C") {
          add({ person: member.key, other: headRef, type: "child" });
          if (spouseRef !== void 0) add({ person: member.key, other: spouseRef, type: "child" });
        } else if (role === "s" || role === "d" || role === "c") {
          add({ person: member.key, other: headRef, type: "child" });
        } else if (role.startsWith("K:")) {
          const [, relation = "", up = "", down = ""] = role.split(":");
          const tie = { person: member.key, other: headRef, type: "kin" };
          if (relation !== "") tie.relation = relation;
          if (up !== "") tie.up = Number(up);
          if (down !== "") tie.down = Number(down);
          add(tie);
        } else {
          fail(n, `unknown role \xAB${role}\xBB`);
        }
      }
      return;
    }
    switch (word) {
      case "scan":
        scan = rest;
        return;
      case "year":
        year = Number(rest);
        return;
      case "place": {
        const [name, type] = [rest.split(/\s+/).slice(0, -1).join(" "), rest.split(/\s+/).at(-1)];
        const typed = type !== void 0 && /^[a-z]+$/.test(type) && name !== "";
        const key = `v${String(places.length + 1)}`;
        places.push({ key, name: typed ? name : rest, ...typed ? { type } : {} });
        currentPlace = key;
        return;
      }
      case "cols": {
        const [p = "", a = "", b = ""] = rest.split(/\s+/);
        cols.set(p, [Number(a), Number(b)]);
        return;
      }
      case "page":
        page = rest;
        return;
      case "section":
        section = rest === "" ? void 0 : rest;
        return;
      case "cont": {
        const [s = "", h = "", flag] = rest.split(/\s+/);
        pendingCont = { scan: s, household: h, spouse: flag === "spouse" };
        current = void 0;
        return;
      }
      case "printed": {
        const [m = "", f = ""] = rest.split(/\s+/);
        if (Number(m) !== counters.m || Number(f) !== counters.f) {
          fail(
            n,
            `printed counters ${m}/${f} but the rows give ${String(counters.m)}/${String(counters.f)}`
          );
        }
        return;
      }
      case "snote":
        scanNotes.push(rest);
        return;
      case "!": {
        if (last === void 0) fail(n, "a doubt needs a person before it");
        const [element = "", read, variants, note] = rest.split(";").map((part) => part.trim());
        const doubt = { element, person: last.key, box: last.box };
        const r1 = opt(read);
        const v1 = opt(variants);
        const n1 = opt(note);
        if (r1 !== void 0) doubt.read = r1;
        if (v1 !== void 0) doubt.variants = v1;
        if (n1 !== void 0) doubt.note = n1;
        doubts.push(doubt);
        return;
      }
      default:
        fail(n, `unknown directive \xAB${word}\xBB`);
    }
  });
  if (scan === void 0 || year === void 0) throw new Error("`scan` and `year` are required");
  const reading = {
    scan,
    year,
    places,
    households,
    doubts,
    scan_attributes: scanNotes.map((value) => ({ type: "note", value }))
  };
  const lastHousehold = households.at(-1);
  const headWife = lastHousehold?.ties.some((tie) => tie.type === "spouse") ?? false;
  return {
    reading: readingSchema.parse(reading),
    summary: {
      persons,
      males: counters.m - options.start.m,
      females: counters.f - options.start.f,
      households: households.length,
      lastHousehold: lastHousehold?.key ?? "",
      lastHeadHasSpouse: headWife,
      counters
    }
  };
}

// src/indexing/households.ts
var personRow = external_exports.object({
  id: external_exports.number(),
  scan_id: external_exports.number(),
  event_id: external_exports.number().nullable()
});
var eventRow = external_exports.object({ id: external_exports.number(), scan_id: external_exports.number(), main_person_id: external_exports.number() });
var tieRow = external_exports.object({ person_id: external_exports.number(), other_id: external_exports.number(), event_id: external_exports.number() });
function fillHouseholds(db) {
  const persons = selectRows(
    db,
    personRow,
    "select id, scan_id, event_id from person where event_id is null order by id"
  );
  if (persons.length === 0) return 0;
  const events = selectRows(
    db,
    eventRow,
    "select id, scan_id, main_person_id from event where main_person_id is not null order by main_person_id"
  );
  const all = selectRows(db, personRow, "select id, scan_id, event_id from person order by id");
  const stored = new Map(
    all.flatMap((person) => person.event_id === null ? [] : [[person.id, person.event_id]])
  );
  const scanOrder = [...new Set(all.map((p) => p.scan_id))];
  const eventOf = /* @__PURE__ */ new Map();
  let lastEvent;
  for (const scan of scanOrder) {
    const inScan = all.filter((p) => p.scan_id === scan);
    const heads = events.filter((e) => e.scan_id === scan);
    let current = lastEvent;
    for (const person of inScan) {
      const head = heads.find((e) => e.main_person_id === person.id);
      const known = stored.get(person.id);
      if (head !== void 0) current = head.id;
      else if (known !== void 0) current = known;
      if (current === void 0) throw new Error(`person ${String(person.id)} has no household`);
      eventOf.set(person.id, known ?? current);
    }
    lastEvent = heads.at(-1)?.id ?? lastEvent;
  }
  for (const tie of selectRows(
    db,
    tieRow,
    "select person_id, other_id, event_id from tie where event_id is not null"
  )) {
    const personEvent = stored.get(tie.person_id) ?? eventOf.get(tie.person_id);
    const otherEvent = stored.get(tie.other_id) ?? eventOf.get(tie.other_id);
    if (personEvent !== tie.event_id || otherEvent !== tie.event_id) {
      throw new Error(
        `tie of persons ${String(tie.person_id)} and ${String(tie.other_id)} is outside its household`
      );
    }
  }
  inTransaction(db, () => {
    const set = db.prepare("update person set event_id = ? where id = ? and event_id is null");
    for (const person of persons) {
      const event = eventOf.get(person.id);
      if (event !== void 0) set.run(event, person.id);
    }
  });
  return persons.length;
}

// src/indexing/ingest.ts
function birthRange(year, age) {
  return { from: year - age - 1, to: year - age };
}
function lookup(map, key, what) {
  const id = map.get(key);
  if (id === void 0) throw new Error(`unknown ${what} key \xAB${key}\xBB`);
  return id;
}
function findHousehold(db, from) {
  const event = selectRows(
    db,
    external_exports.object({ id: external_exports.number(), main_person_id: external_exports.number() }),
    `select e.id, e.main_person_id from event e join scan s on s.id = e.scan_id
      where s.name = ? and e.key = ? and e.main_person_id is not null order by e.run_id desc limit 1`,
    [from.scan, from.household]
  )[0];
  if (event === void 0) {
    throw new Error(`no household \xAB${from.household}\xBB read on scan \xAB${from.scan}\xBB to continue`);
  }
  const spouse = selectRows(
    db,
    external_exports.object({ person_id: external_exports.number() }),
    "select person_id from tie where event_id = ? and other_id = ? and type = 'spouse' order by id limit 1",
    [event.id, event.main_person_id]
  )[0];
  return { eventId: event.id, headId: event.main_person_id, spouseId: spouse?.person_id };
}
function insert(db, sql, params) {
  return Number(db.prepare(sql).run(...params).lastInsertRowid);
}
function ingestReading(db, runId, input) {
  const reading = readingSchema.parse(input);
  return inTransaction(db, () => writeReading(db, runId, reading));
}
function writeReading(db, runId, reading) {
  const scan = selectRows(db, external_exports.object({ id: external_exports.number() }), "select id from scan where name = ?", [
    reading.scan
  ])[0];
  if (scan === void 0) throw new Error(`unknown scan \xAB${reading.scan}\xBB`);
  if (selectRows(db, external_exports.object({ id: external_exports.number() }), "select id from run where id = ?", [runId]).length === 0) {
    throw new Error(`unknown run ${String(runId)}`);
  }
  const scanId = scan.id;
  if (reading.source !== void 0 && selectRows(db, external_exports.object({ id: external_exports.number() }), "select id from source where id = ?", [
    reading.source
  ]).length === 0) {
    throw new Error(`unknown source ${String(reading.source)}: add it to the bank first`);
  }
  if (reading.source !== void 0) {
    db.prepare("update scan set source_id = ? where id = ? and source_id is null").run(
      reading.source,
      scanId
    );
  }
  const boxId = (box) => box === void 0 ? null : insert(db, "insert into box (scan_id, x, y, w, h, origin) values (?, ?, ?, ?, ?, ?)", [
    scanId,
    box.x,
    box.y,
    box.w,
    box.h,
    box.origin
  ]);
  const counts = {
    lines: 0,
    places: 0,
    persons: 0,
    events: 0,
    ties: 0,
    nameMentions: 0,
    doubts: 0,
    dictionary: 0,
    attributes: 0
  };
  const addAttributes = (owner, ownerId, attributes, fallbackBox) => {
    for (const attribute of attributes) {
      insert(
        db,
        `insert into attribute (run_id, scan_id, box_id, type, ${owner}, value) values (?, ?, ?, ?, ?, ?)`,
        [
          runId,
          scanId,
          boxId(attribute.box) ?? fallbackBox,
          attribute.type,
          ownerId ?? 1,
          attribute.value
        ]
      );
      counts.attributes += 1;
    }
  };
  addAttributes("on_scan", void 0, reading.scan_attributes, null);
  const lineIds = /* @__PURE__ */ new Map();
  for (const line of reading.lines) {
    if (lineIds.has(line.key)) throw new Error(`duplicate line key \xAB${line.key}\xBB`);
    lineIds.set(
      line.key,
      insert(db, "insert into text_line (run_id, scan_id, box_id, text) values (?, ?, ?, ?)", [
        runId,
        scanId,
        boxId(line.box),
        line.text
      ])
    );
    counts.lines += 1;
  }
  const lineOf = (key) => key === void 0 ? null : lookup(lineIds, key, "line");
  const placeIds = /* @__PURE__ */ new Map();
  for (const place of reading.places) {
    if (placeIds.has(place.key)) throw new Error(`duplicate place key \xAB${place.key}\xBB`);
    placeIds.set(
      place.key,
      insert(
        db,
        "insert into place (run_id, scan_id, box_id, line_id, name, type) values (?, ?, ?, ?, ?, ?)",
        [runId, scanId, boxId(place.box), lineOf(place.line), place.name, place.type ?? null]
      )
    );
    counts.places += 1;
  }
  const personIds = /* @__PURE__ */ new Map();
  const personBoxes = /* @__PURE__ */ new Map();
  for (const household of reading.households) {
    const heads = household.members.filter((member) => member.head);
    const continued = household.continues === void 0 ? void 0 : findHousehold(db, household.continues);
    if (continued === void 0 ? heads.length !== 1 : heads.length !== 0) {
      throw new Error(
        continued === void 0 ? `household \xAB${household.key}\xBB must have exactly one head, has ${String(heads.length)}` : `household \xAB${household.key}\xBB continues another one and must have no head`
      );
    }
    const householdBox = boxId(household.box);
    const householdLine = lineOf(household.line);
    const memberIds = /* @__PURE__ */ new Map();
    for (const member of household.members) {
      if (personIds.has(member.key)) throw new Error(`duplicate person key \xAB${member.key}\xBB`);
      const birth = typeof member.age === "number" ? birthRange(reading.year, member.age) : void 0;
      const memberBox = boxId(member.box) ?? householdBox;
      const memberLine = lineOf(member.line) ?? householdLine;
      const id = insert(
        db,
        `insert into person (run_id, scan_id, box_id, line_id, gender, given, patronymic, surname,
                             age, birth_from, birth_to, birth_qual)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          runId,
          scanId,
          memberBox,
          memberLine,
          member.gender ?? null,
          member.given ?? null,
          member.patronymic ?? null,
          member.surname ?? null,
          member.age === void 0 ? null : String(member.age),
          birth?.from ?? null,
          birth?.to ?? null,
          birth === void 0 ? null : "calculated"
        ]
      );
      addAttributes("person_id", id, member.attributes, memberBox);
      personIds.set(member.key, id);
      personBoxes.set(member.key, memberBox);
      memberIds.set(member.key, id);
      counts.persons += 1;
      for (const [kind, text, partBox] of [
        ["given", member.given, member.given_box],
        ["patronymic", member.patronymic, member.patronymic_box],
        ["surname", member.surname, member.surname_box]
      ]) {
        if (text === void 0) continue;
        insert(
          db,
          `insert into name_mention (run_id, scan_id, box_id, line_id, person_id, kind, text)
           values (?, ?, ?, ?, ?, ?, ?)`,
          [runId, scanId, boxId(partBox) ?? memberBox, memberLine, id, kind, text]
        );
        counts.nameMentions += 1;
      }
    }
    const head = heads[0];
    let eventId;
    if (continued !== void 0) {
      eventId = continued.eventId;
    } else {
      if (head === void 0) throw new Error("unreachable: household without head");
      eventId = insert(
        db,
        `insert into event (run_id, scan_id, box_id, line_id, type, main_person_id, year, place_id,
                            number, key, source_id)
         values (?, ?, ?, ?, 'confession', ?, ?, ?, ?, ?, ?)`,
        [
          runId,
          scanId,
          householdBox,
          householdLine,
          lookup(memberIds, head.key, "person"),
          reading.year,
          household.place === void 0 ? null : lookup(placeIds, household.place, "place"),
          household.number ?? null,
          household.key,
          reading.source ?? null
        ]
      );
      counts.events += 1;
    }
    for (const id of memberIds.values()) {
      db.prepare("update person set event_id = ? where id = ?").run(eventId, id);
    }
    addAttributes("event_id", eventId, household.attributes, householdBox);
    const tieEnd = (ref) => {
      if (ref === "@head" || ref === "@spouse") {
        if (continued === void 0) throw new Error(`\xAB${ref}\xBB is only for a continued household`);
        const id = ref === "@head" ? continued.headId : continued.spouseId;
        if (id === void 0) throw new Error(`the continued household has no ${ref.slice(1)}`);
        return id;
      }
      return lookup(memberIds, ref, "person");
    };
    for (const tie of household.ties) {
      insert(
        db,
        `insert into tie (run_id, scan_id, box_id, line_id, person_id, other_id, type, relation, up,
                          down, event_id)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          runId,
          scanId,
          boxId(tie.box) ?? householdBox,
          lineOf(tie.line) ?? householdLine,
          tieEnd(tie.person),
          tieEnd(tie.other),
          tie.type,
          tie.relation ?? null,
          tie.up ?? null,
          tie.down ?? null,
          eventId
        ]
      );
      counts.ties += 1;
    }
  }
  const membersByKey = new Map(
    reading.households.flatMap(
      (household) => household.members.map((member) => [member.key, member])
    )
  );
  for (const doubt of reading.doubts) {
    if (doubt.person !== void 0 && (doubt.element === "surname" || doubt.element === "given" || doubt.element === "patronymic")) {
      const member = membersByKey.get(doubt.person);
      if (member?.[doubt.element] === void 0) {
        throw new Error(
          `doubt about the ${doubt.element} of \xAB${doubt.person}\xBB, but the person has no ${doubt.element}: put the most plausible full variant there`
        );
      }
    }
    insert(
      db,
      `insert into doubt (run_id, scan_id, box_id, element, person_id, place_id, read_text, variants,
                          unreadable, note)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        runId,
        scanId,
        boxId(doubt.box) ?? (doubt.person === void 0 ? null : personBoxes.get(doubt.person) ?? null),
        doubt.element,
        doubt.person === void 0 ? null : lookup(personIds, doubt.person, "person"),
        doubt.place === void 0 ? null : lookup(placeIds, doubt.place, "place"),
        doubt.read ?? null,
        doubt.variants ?? null,
        doubt.unreadable ? 1 : 0,
        doubt.note ?? null
      ]
    );
    counts.doubts += 1;
  }
  const dictionarySkipped = [];
  for (const entry of reading.dictionary) {
    const existing = selectRows(
      db,
      external_exports.object({ canon: external_exports.string().nullable() }),
      "select canon from dict_entry where kind = ? and word = ?",
      [entry.kind, entry.word]
    )[0];
    if (existing === void 0) {
      db.prepare("insert into dict_entry (kind, word, canon, note) values (?, ?, ?, ?)").run(
        entry.kind,
        entry.word,
        entry.canon ?? null,
        entry.note ?? null
      );
      counts.dictionary += 1;
    } else if (entry.canon !== void 0 && entry.canon !== existing.canon) {
      dictionarySkipped.push({
        kind: entry.kind,
        word: entry.word,
        canon: existing.canon,
        proposed: entry.canon
      });
    }
  }
  return { ...counts, dictionarySkipped };
}

// src/indexing/merge.ts
var SHARED = ["repository", "source"];
var MAP_KIND_TABLE = {
  person: "person",
  event: "event",
  tie: "tie",
  place: "place",
  citation: "scan"
};
var nameRow2 = external_exports.object({ name: external_exports.string() });
var columnRow = external_exports.object({ name: external_exports.string(), pk: external_exports.number() });
var foreignKeyRow = external_exports.object({ from: external_exports.string(), table: external_exports.string() });
function ident(name) {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`unexpected identifier: ${name}`);
  return name;
}
function tableNames(db, schema) {
  return selectRows(
    db,
    nameRow2,
    `select name from ${schema}.sqlite_master where type = 'table' and name not like 'sqlite_%' order by name`
  ).map((row) => row.name);
}
function columnsOf(db, schema, table) {
  return selectRows(
    db,
    columnRow,
    `select name, pk from pragma_table_info('${table}', '${schema}')`
  ).map((row) => row.name);
}
function scalar(db, sql) {
  return selectRows(db, external_exports.object({ n: external_exports.number() }), sql)[0]?.n ?? 0;
}
function mergeBanks(target, sourcePath) {
  target.prepare("attach database ? as src").run(sourcePath);
  try {
    const version = (schema) => external_exports.object({ user_version: external_exports.number() }).parse({
      ...target.prepare(`pragma ${schema}.user_version`).get()
    }).user_version;
    if (version("src") !== version("main")) {
      throw new Error("the banks have different schema versions: open both with the tool first");
    }
    return inTransaction(target, () => mergeAttached(target));
  } finally {
    target.exec("detach database src");
  }
}
function mergeAttached(db) {
  db.exec("pragma defer_foreign_keys = on");
  const tables = tableNames(db, "main").filter((t) => t !== "meta");
  const shared = new Set(SHARED);
  const offset = /* @__PURE__ */ new Map();
  for (const table of tables) {
    if (shared.has(table) || table === "ddb_map") continue;
    offset.set(table, scalar(db, `select coalesce(max(id), 0) as n from main.${ident(table)}`));
  }
  const clash = scalar(
    db,
    "select count(*) as n from src.scan s join main.scan m on m.name = s.name"
  );
  if (clash > 0) throw new Error(`${String(clash)} scans of the source are already in the target`);
  const added = {};
  const skipped = {};
  const repoMap = mergeShared(db, "repository", [], added, skipped, /* @__PURE__ */ new Map());
  mergeShared(db, "source", ["repo_id"], added, skipped, repoMap);
  const order = dependencyOrder(
    db,
    tables.filter((t) => !shared.has(t) && t !== "ddb_map")
  );
  for (const table of order) {
    const columns = columnsOf(db, "main", table);
    const parents = new Map(
      selectRows(
        db,
        foreignKeyRow,
        `select "from", "table" from pragma_foreign_key_list('${table}', 'main')`
      ).map((row) => [row.from, row.table])
    );
    const own = offset.get(table) ?? 0;
    const select = columns.map((column) => {
      const quoted = `"${ident(column)}"`;
      if (column === "id") return `${quoted} + ${String(own)}`;
      const parent = parents.get(column);
      const shift = parent === void 0 ? void 0 : offset.get(parent);
      if (shift !== void 0) return `${quoted} + ${String(shift)}`;
      if (table === "sample" && column === "rank") {
        const base = scalar(db, "select coalesce(max(rank), 0) as n from main.sample");
        return `${quoted} + ${String(base)}`;
      }
      return quoted;
    });
    const verb = table === "dict_entry" ? "insert or ignore" : "insert";
    const before = scalar(db, `select count(*) as n from main.${table}`);
    const total = scalar(db, `select count(*) as n from src.${table}`);
    db.exec(
      `${verb} into main.${table} (${columns.map((c) => `"${c}"`).join(", ")})
       select ${select.join(", ")} from src.${table} order by id`
    );
    const now = scalar(db, `select count(*) as n from main.${table}`) - before;
    added[table] = now;
    if (now < total) skipped[table] = total - now;
  }
  const mapBefore = scalar(db, "select count(*) as n from main.ddb_map");
  for (const [kind, table] of Object.entries(MAP_KIND_TABLE)) {
    db.prepare(
      `insert or ignore into main.ddb_map (kind, local_id, ddb_id)
       select kind, local_id + ?, ddb_id from src.ddb_map where kind = ?`
    ).run(offset.get(table) ?? 0, kind);
  }
  added.ddb_map = scalar(db, "select count(*) as n from main.ddb_map") - mapBefore;
  const broken = db.prepare("pragma foreign_key_check").all();
  if (broken.length > 0) throw new Error(`merge left ${String(broken.length)} broken references`);
  return { added, skipped };
}
function dependencyOrder(db, tables) {
  const parentsOf = new Map(
    tables.map((table) => [
      table,
      selectRows(
        db,
        foreignKeyRow,
        `select "from", "table" from pragma_foreign_key_list('${table}', 'main')`
      ).map((row) => row.table).filter((parent) => parent !== table && tables.includes(parent))
    ])
  );
  const done = [];
  const visit = (table, trail) => {
    if (done.includes(table)) return;
    if (trail.includes(table)) return;
    for (const parent of parentsOf.get(table) ?? []) visit(parent, [...trail, table]);
    done.push(table);
  };
  for (const table of tables) visit(table, []);
  return done;
}
function mergeShared(db, table, refColumns, added, skipped, refMap) {
  const columns = columnsOf(db, "main", table).filter((c) => c !== "id");
  const idMap = /* @__PURE__ */ new Map();
  const rows = db.prepare(`select * from src.${table} order by id`).all();
  let count = 0;
  for (const row of rows) {
    const values = columns.map((column) => {
      const value = row[column];
      if (refColumns.includes(column) && typeof value === "number") {
        return refMap.get(value) ?? value;
      }
      if (value === null || typeof value === "string" || typeof value === "number") return value;
      throw new Error(`unexpected value in ${table}.${column}`);
    });
    const oldId = Number(row.id);
    const where = columns.map((c) => `"${c}" is ?`).join(" and ");
    const found = selectRows(
      db,
      external_exports.object({ id: external_exports.number() }),
      `select id from main.${table} where ${where}`,
      values
    )[0];
    if (found !== void 0) {
      idMap.set(oldId, found.id);
      continue;
    }
    const result = db.prepare(
      `insert into main.${table} (${columns.map((c) => `"${c}"`).join(", ")}) values (${columns.map(() => "?").join(", ")})`
    ).run(...values);
    idMap.set(oldId, Number(result.lastInsertRowid));
    count += 1;
  }
  added[table] = count;
  if (count < rows.length) skipped[table] = rows.length - count;
  return idMap;
}

// src/indexing/sample.ts
import { createHash } from "node:crypto";

// src/indexing/constants.ts
var SAMPLE_SIZE = 20;

// src/indexing/sample.ts
var idRow = external_exports.object({ id: external_exports.number() });
function hashOf(seed, runId, id) {
  return createHash("sha256").update(`${seed}:${String(runId)}:${String(id)}`).digest("hex");
}
function sampleMentions(db, runId) {
  return selectRows(
    db,
    external_exports.object({ name_mention_id: external_exports.number() }),
    "select name_mention_id from sample where run_id = ? order by rank",
    [runId]
  ).map((row) => row.name_mention_id);
}
function buildSample(db, seed, runId, size = SAMPLE_SIZE) {
  if (selectRows(db, idRow, "select id from run where id = ?", [runId]).length === 0) {
    throw new Error(`unknown run ${String(runId)}`);
  }
  const existing = sampleMentions(db, runId);
  if (existing.length > 0) return existing;
  const candidates = selectRows(
    db,
    idRow,
    "select id from name_mention where kind = 'surname' and box_id is not null and run_id = ?",
    [runId]
  );
  if (candidates.length === 0) {
    throw new Error(`run ${String(runId)} has no surname with a box to build a sample from`);
  }
  const picked = candidates.map((row) => ({ id: row.id, hash: hashOf(seed, runId, row.id) })).toSorted((a, b) => a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : a.id - b.id).slice(0, size);
  inTransaction(db, () => {
    const insert2 = db.prepare(
      "insert into sample (run_id, name_mention_id, rank) values (?, ?, ?)"
    );
    picked.forEach((item, i) => insert2.run(runId, item.id, i + 1));
  });
  return picked.map((item) => item.id);
}

// src/indexing/scans.ts
var scanListSchema = external_exports.array(
  external_exports.strictObject({
    /** Name of the scan; becomes the page of the citation. */
    name: external_exports.string().min(1),
    url: external_exports.string().min(1),
    width: external_exports.int().positive(),
    height: external_exports.int().positive(),
    md5: external_exports.string().length(32).optional()
  })
);
function addScans(db, input) {
  const scans = scanListSchema.parse(input);
  return inTransaction(db, () => {
    const insert2 = db.prepare(
      "insert or ignore into scan (name, url, width, height, md5) values (?, ?, ?, ?, ?)"
    );
    let added = 0;
    for (const scan of scans) {
      added += Number(
        insert2.run(scan.name, scan.url, scan.width, scan.height, scan.md5 ?? null).changes
      );
    }
    return added;
  });
}

// src/indexing/cli.ts
var USAGE = `usage: indexing <command> <case dir> [options]
  operator [--set CREDIT]             print who runs the indexing, or set it (no case dir): one line of
                                      Markdown, e.g. "[Name](mailto:name@example.org)"; run-start needs it
  init                                create the case database
  scans <scans.json>                  add scans: [{name, url, width, height, md5?}]
  run-start --model M [--session S] [--effort E] [--sha SHA] [--note N]   print the run id
  ingest <run id> <reading.json>      write the reading of one scan
  sample <run id>                     build (once per run) and print the sample of its surname places
  hints [--kind given|patronymic|surname]   print the dictionary and the names already read in this case
  run-report <run id>                 print what the bank says about the run (counts, error rate)
  households                          give a household to persons of an old bank that has none (the loading into a database needs it)
  compact <run id> <file>             read a scan from the compact notation (references/document-types/confession.md) and ingest it
  merge <source case dir>             add the bank of another case dir to this one (scans must differ)
  dump <file.sqlite>                  text dump for git diff (the first argument is the file)`;
function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
function procedureSha() {
  try {
    const sha = execFileSync(
      "git",
      ["log", "-1", "--format=%H", "--", ":/skills/imennyk/references/workflow.md"],
      { encoding: "utf8", cwd: import.meta.dirname, stdio: ["ignore", "pipe", "ignore"] }
    ).trim();
    return sha === "" ? void 0 : sha;
  } catch {
    return void 0;
  }
}
function main(argv) {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      model: { type: "string" },
      session: { type: "string" },
      effort: { type: "string" },
      sha: { type: "string" },
      note: { type: "string" },
      kind: { type: "string" },
      set: { type: "string" }
    }
  });
  const [command, caseDir, arg] = positionals;
  if (command === "operator") {
    if (values.set !== void 0) {
      console.log(`operator written to ${writeOperator(values.set)}`);
      return;
    }
    const credit = readOperator();
    if (credit === void 0) {
      console.log(`not set up: ${localOperatorPath()}`);
      process.exitCode = 3;
      return;
    }
    console.log(credit);
    return;
  }
  if (command === void 0 || caseDir === void 0) {
    console.log(USAGE);
    process.exitCode = 1;
    return;
  }
  if (command === "dump") {
    process.stdout.write(dumpCaseDb(caseDir));
    return;
  }
  const db = openCaseDb(join(caseDir, "case.sqlite"));
  const seed = basename(caseDir);
  switch (command) {
    case "init":
      db.prepare("insert or ignore into meta (key, value) values ('sample_seed', ?)").run(seed);
      console.log(`case database ready: ${join(caseDir, "case.sqlite")}`);
      return;
    case "scans":
      console.log(`added ${String(addScans(db, readJson(requireArg(arg, "scans.json"))))} scans`);
      return;
    case "run-start": {
      if (values.model === void 0) throw new Error("--model is required");
      const operator = requireOperator();
      const sha = values.sha ?? procedureSha();
      const id = startRun(db, {
        startedAt: (/* @__PURE__ */ new Date()).toISOString(),
        model: values.model,
        operator,
        ...values.session === void 0 ? {} : { session: values.session },
        ...values.effort === void 0 ? {} : { effort: values.effort },
        ...sha === void 0 ? {} : { procedureSha: sha },
        ...values.note === void 0 ? {} : { note: values.note }
      });
      console.log(id);
      return;
    }
    case "ingest": {
      const file = positionals[3];
      console.log(
        JSON.stringify(
          ingestReading(
            db,
            Number(requireArg(arg, "run id")),
            readJson(requireArg(file, "reading.json"))
          )
        )
      );
      return;
    }
    case "sample": {
      const stored = selectRows(
        db,
        external_exports.object({ value: external_exports.string() }),
        "select value from meta where key = 'sample_seed'"
      )[0];
      const ids = buildSample(db, stored?.value ?? seed, runIdOf(arg));
      console.log(`sample: ${String(ids.length)} places`);
      return;
    }
    case "compact": {
      const runId = Number(requireArg(arg, "run id"));
      const file = requireArg(positionals[3], "compact file");
      const counter = (gender) => selectRows(
        db,
        external_exports.object({ n: external_exports.number() }),
        `select coalesce(max(cast(a.value as integer)), 0) as n from attribute a
             join person p on p.id = a.person_id
            where a.type = 'serial' and p.run_id = ? and p.gender = ?`,
        [runId, gender]
      )[0]?.n ?? 0;
      const { reading, summary } = compactToReading(readFileSync(file, "utf8"), {
        start: { m: counter("male"), f: counter("female") }
      });
      const result = ingestReading(db, runId, reading);
      console.log(JSON.stringify({ summary, result }));
      return;
    }
    case "merge": {
      const source = join(requireArg(arg, "source case dir"), "case.sqlite");
      openCaseDb(source).close();
      const result = mergeBanks(db, source);
      console.log(JSON.stringify(result));
      return;
    }
    case "hints": {
      const kind = parseNameKind(values.kind);
      process.stdout.write(formatHints(caseHints(db, kind === void 0 ? {} : { kind })));
      return;
    }
    case "households":
      console.log(`${String(fillHouseholds(db))} persons got a household`);
      return;
    case "run-report":
      process.stdout.write((0, import_yaml.stringify)(runSummary(db, Number(requireArg(arg, "run id")))));
      return;
    default:
      console.log(USAGE);
      process.exitCode = 1;
  }
}
function runIdOf(value) {
  const id = Number(requireArg(value, "run id"));
  if (!Number.isInteger(id) || id < 1)
    throw new Error(`run id must be a whole number: ${String(value)}`);
  return id;
}
function requireArg(value, name) {
  if (value === void 0) throw new Error(`missing ${name}`);
  return value;
}
main(process.argv.slice(2));
