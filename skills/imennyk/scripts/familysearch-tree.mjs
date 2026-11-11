// Built by `pnpm build:skill` from src/; do not edit by hand.
import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);
import {
  requireOperator
} from "./chunk-7FCHIHK4.mjs";
import {
  DATE_QUALS,
  GENDERS,
  external_exports,
  inTransaction,
  openCaseDb,
  selectRows,
  startRun
} from "./chunk-IPSGNSK4.mjs";

// src/familysearch/tree/cli.ts
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

// src/familysearch/tree/browser.ts
var TAB = external_exports.object({ id: external_exports.string(), webSocketDebuggerUrl: external_exports.string() });
var EVALUATED = external_exports.object({
  result: external_exports.object({
    result: external_exports.object({ value: external_exports.unknown().optional() }).optional(),
    exceptionDetails: external_exports.unknown().optional()
  })
});
var SERVICE = "/service/tree";
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function withFamilySearch(startPerson, use, options = {}) {
  const devtools = options.devtools ?? "http://127.0.0.1:9222";
  const pauseMs = options.pauseMs ?? 120;
  const tab = TAB.parse(
    await (await fetch(`${devtools}/json/new?about:blank`, { method: "PUT" })).json()
  );
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", () => {
      resolve();
    });
    ws.addEventListener("error", () => {
      reject(new Error("cannot connect to Chrome DevTools"));
    });
  });
  let counter = 0;
  const pending = /* @__PURE__ */ new Map();
  ws.addEventListener("message", (event) => {
    const message = external_exports.object({ id: external_exports.number().optional() }).loose().safeParse(JSON.parse(String(event.data)));
    if (message.success && message.data.id !== void 0) {
      pending.get(message.data.id)?.(message.data);
      pending.delete(message.data.id);
    }
  });
  const send = (method, params = {}) => new Promise((resolve) => {
    counter += 1;
    pending.set(counter, resolve);
    ws.send(JSON.stringify({ id: counter, method, params }));
  });
  const evaluate = async (expression) => {
    const reply = EVALUATED.parse(
      await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })
    );
    if (reply.result.exceptionDetails !== void 0) {
      throw new Error(`browser error: ${JSON.stringify(reply.result.exceptionDetails)}`);
    }
    return reply.result.result?.value;
  };
  const call = async (path) => {
    await sleep(pauseMs);
    const reply = external_exports.object({ status: external_exports.number(), body: external_exports.unknown() }).parse(
      await evaluate(
        `(async()=>{const r=await fetch(${JSON.stringify(path)},{headers:{Accept:"application/json"}});const t=await r.text();let b=null;try{b=JSON.parse(t)}catch{}return {status:r.status,body:b}})()`
      )
    );
    if (reply.status === 404) return null;
    if (reply.status === 401 || reply.status === 403) {
      throw new Error(
        `FamilySearch answered ${String(reply.status)}: the session is gone, log in again (noVNC)`
      );
    }
    if (reply.status !== 200)
      throw new Error(`FamilySearch answered ${String(reply.status)} for ${path}`);
    return reply.body;
  };
  try {
    await send("Page.enable");
    await send("Page.navigate", {
      url: `https://www.familysearch.org/uk/tree/pedigree/fanchart/${startPerson}`
    });
    let ready = false;
    for (let attempt = 0; attempt < 30 && !ready; attempt += 1) {
      await sleep(1e3);
      try {
        ready = await call(`${SERVICE}/tree-data/v8/person/${startPerson}/summary`) !== null;
      } catch {
        ready = false;
      }
    }
    if (!ready) throw new Error("FamilySearch did not open: no session or a security check");
    return await use({
      pedigree: (root) => call(
        `${SERVICE}/tree-data/r9/portrait-pedigree/${root}?includeMarriages=true&numGenerations=8`
      ),
      details: (id) => call(`${SERVICE}/tree-data/v8/person/${id}/details`),
      sourceRefs: (id) => call(`${SERVICE}/tf/person/${id}/entityref?version=2`),
      sourceLinks: (ids) => call(`${SERVICE}/links/sources/${ids.join(",")}?readExternalData=true`)
    });
  } finally {
    ws.close();
    await fetch(`${devtools}/json/close/${tab.id}`);
  }
}

// src/familysearch/tree/api.ts
var nullish = (schema) => schema.nullish();
var summarySchema = external_exports.looseObject({
  id: external_exports.string().min(1),
  living: external_exports.boolean(),
  gender: nullish(external_exports.string()),
  lifespan: nullish(external_exports.string())
});
var parentIds = external_exports.looseObject({
  parent1Id: nullish(external_exports.string()),
  parent2Id: nullish(external_exports.string())
});
var coupleSchema = external_exports.looseObject({
  parent1: nullish(summarySchema),
  parent2: nullish(summarySchema),
  parent1ParentIds: nullish(parentIds),
  parent2ParentIds: nullish(parentIds)
});
var pedigreeSchema = external_exports.looseObject({
  ancestors: external_exports.array(external_exports.array(coupleSchema))
});
var placeSchema = external_exports.looseObject({
  id: nullish(external_exports.number()),
  originalText: nullish(external_exports.string()),
  normalizedText: nullish(external_exports.string()),
  geoCode: nullish(external_exports.looseObject({ latitude: external_exports.number(), longitude: external_exports.number() }))
});
var dateSchema = external_exports.looseObject({
  formalText: nullish(external_exports.string()),
  originalText: nullish(external_exports.string()),
  normalizedText: nullish(external_exports.string()),
  modifier: nullish(external_exports.string())
});
var factSchema = external_exports.looseObject({
  details: external_exports.looseObject({
    date: nullish(dateSchema),
    place: nullish(placeSchema)
  })
});
var nameFormSchema = external_exports.looseObject({
  lang: nullish(external_exports.string()),
  givenPart: nullish(external_exports.string()),
  familyPart: nullish(external_exports.string()),
  fullText: nullish(external_exports.string())
});
var familySchema = external_exports.looseObject({
  parent1: nullish(summarySchema),
  parent2: nullish(summarySchema),
  preferred: nullish(external_exports.boolean()),
  event: nullish(factSchema)
});
var detailsSchema = external_exports.looseObject({
  id: external_exports.string().min(1),
  living: external_exports.boolean(),
  gender: nullish(external_exports.string()),
  sourceCount: nullish(external_exports.number()),
  birth: nullish(factSchema),
  death: nullish(factSchema),
  nameConclusion: nullish(
    external_exports.looseObject({
      details: external_exports.looseObject({ nameForms: external_exports.array(nameFormSchema) })
    })
  ),
  parents: external_exports.array(familySchema).default([]),
  spouses: external_exports.array(familySchema).default([])
});
var entityRefsSchema = external_exports.looseObject({
  entityRefs: external_exports.array(external_exports.looseObject({ value: external_exports.looseObject({ type: external_exports.string(), uri: external_exports.string() }) })).default([])
});
var sourceLinksSchema = external_exports.looseObject({
  sources: external_exports.array(
    external_exports.looseObject({
      id: external_exports.string(),
      title: nullish(external_exports.string()),
      uri: nullish(external_exports.looseObject({ uri: nullish(external_exports.string()) })),
      event: nullish(external_exports.looseObject({ originalDate: nullish(external_exports.string()) }))
    })
  ).default([])
});

// src/living.ts
var LIVING_HORIZON_YEARS = 110;
function livingState(facts, referenceYear) {
  if (facts.flaggedLiving === true) return "living";
  if (facts.deathRecorded) return "dead";
  if (facts.birthYear === void 0) return "unknown";
  return referenceYear - facts.birthYear < LIVING_HORIZON_YEARS ? "living" : "dead";
}

// src/familysearch/tree/parse.ts
var pad = (n) => String(n).padStart(2, "0");
var year4 = (n) => String(n).padStart(4, "0");
function lastDay(year2, month) {
  return new Date(Date.UTC(year2, month, 0)).getUTCDate();
}
function readFormalDate(formal) {
  if (formal === null || formal === void 0) return null;
  const m = /^(A)?\+(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(formal);
  if (m === null) return null;
  const year2 = Number(m[2]);
  const month = m[3] === void 0 ? void 0 : Number(m[3]);
  const day = m[4] === void 0 ? void 0 : Number(m[4]);
  if (month !== void 0 && (month < 1 || month > 12)) return null;
  if (month !== void 0 && day !== void 0 && (day < 1 || day > lastDay(year2, month))) {
    return null;
  }
  if (m[1] !== void 0) {
    if (month !== void 0) return null;
    return { from: `${year4(year2 - 2)}-01-01`, to: `${year4(year2 + 2)}-12-31`, qual: "about" };
  }
  const y = year4(year2);
  if (month === void 0) return { from: `${y}-01-01`, to: `${y}-12-31`, qual: "exact" };
  if (day === void 0) {
    return {
      from: `${y}-${pad(month)}-01`,
      to: `${y}-${pad(month)}-${pad(lastDay(year2, month))}`,
      qual: "exact"
    };
  }
  const exact = `${y}-${pad(month)}-${pad(day)}`;
  return { from: exact, to: exact, qual: "exact" };
}
function readDate(date) {
  const formal = readFormalDate(date.formalText);
  if (formal !== null) return formal;
  const text = (date.originalText ?? date.normalizedText ?? "").trim();
  return /^\d{4}$/.test(text) && date.modifier == null ? readFormalDate(`+${text}`) : null;
}
function readPlace(place) {
  const name = (place.originalText ?? place.normalizedText ?? "").trim();
  if (name === "") return null;
  const standard = place.normalizedText?.trim();
  return {
    id: place.id ?? null,
    name,
    standard: standard === void 0 || standard === "" ? null : standard,
    latitude: place.geoCode?.latitude ?? null,
    longitude: place.geoCode?.longitude ?? null
  };
}
function readFact(fact) {
  if (fact === null || fact === void 0) return null;
  const { date, place } = fact.details;
  const parsed = date == null ? null : readDate(date);
  const text = date == null ? "" : (date.originalText ?? date.normalizedText ?? "").trim();
  const event = {
    date: parsed,
    dateText: parsed === null && text !== "" ? text : null,
    place: place == null ? null : readPlace(place)
  };
  return event.date === null && event.dateText === null && event.place === null ? null : event;
}
function yearOf(date) {
  return date === null ? void 0 : Number(date.from.slice(0, 4));
}
var PATRONYMIC = /(ович|евич|євич|йович|івна|ївна|ична|овна|евна|ічна)$/u;
function splitGiven(given) {
  const words = given.trim().split(/\s+/u);
  const [first, second] = words;
  if (words.length === 2 && first !== void 0 && second !== void 0 && PATRONYMIC.test(second.toLowerCase())) {
    return { given: first, patronymic: second };
  }
  return { given: given.trim(), patronymic: null };
}
function orNull(value) {
  const text = value?.trim();
  return text === void 0 || text === "" ? null : text;
}
function livingOf(details, referenceYear) {
  const birth = readFact(details.birth);
  return livingState(
    {
      flaggedLiving: details.living,
      deathRecorded: details.death != null,
      birthYear: yearOf(birth?.date ?? null)
    },
    referenceYear
  );
}
function genderOf(value) {
  if (value === "MALE") return "male";
  if (value === "FEMALE") return "female";
  return null;
}
function otherIds(parent1, parent2, self) {
  return [parent1, parent2].flatMap((p) => p == null || p.id === self ? [] : [p.id]);
}
function readPerson(details) {
  const forms = details.nameConclusion?.details.nameForms ?? [];
  const uk = forms.find((f) => f.lang === "uk") ?? forms.find((f) => f.lang !== "uk-Latn");
  const latin = forms.find((f) => f.lang === "uk-Latn");
  const rawGiven = orNull(uk?.givenPart);
  const split = rawGiven === null ? null : splitGiven(rawGiven);
  return {
    id: details.id,
    gender: genderOf(details.gender),
    given: split?.given ?? null,
    patronymic: split?.patronymic ?? null,
    surname: orNull(uk?.familyPart),
    latin: orNull(latin?.fullText),
    birth: readFact(details.birth),
    death: readFact(details.death),
    parents: details.parents.flatMap((p) => otherIds(p.parent1, p.parent2, details.id)),
    spouses: details.spouses.flatMap(
      (s) => otherIds(s.parent1, s.parent2, details.id).map((id) => ({
        id,
        marriage: readFact(s.event)
      }))
    ),
    sources: []
  };
}

// src/familysearch/tree/crawl.ts
var MAX_GENERATIONS = 8;
function pedigreeIds(pedigree) {
  const living = /* @__PURE__ */ new Set();
  const alive = /* @__PURE__ */ new Set();
  const deeper = /* @__PURE__ */ new Set();
  const last = pedigree.ancestors.length - 1;
  pedigree.ancestors.forEach((generation, index) => {
    for (const couple of generation) {
      for (const [parent, parentIds2] of [
        [couple.parent1, couple.parent1ParentIds],
        [couple.parent2, couple.parent2ParentIds]
      ]) {
        if (parent == null) continue;
        if (parent.living) {
          living.add(parent.id);
          continue;
        }
        alive.add(parent.id);
        const hasParents = parentIds2?.parent1Id != null || parentIds2?.parent2Id != null;
        if (index === last && pedigree.ancestors.length >= MAX_GENERATIONS && hasParents) {
          deeper.add(parent.id);
        }
      }
    }
  });
  return { living, alive, deeper };
}
async function ancestorsOf(fetcher, root) {
  const ids = /* @__PURE__ */ new Set([root]);
  const living = /* @__PURE__ */ new Set();
  const rooted = /* @__PURE__ */ new Set();
  const queue = [root];
  for (let next = queue.shift(); next !== void 0; next = queue.shift()) {
    if (rooted.has(next)) continue;
    rooted.add(next);
    const reply = await fetcher.pedigree(next);
    if (reply === null)
      throw new Error(`no pedigree for ${next}: not logged in, or no such person`);
    const found = pedigreeIds(pedigreeSchema.parse(reply));
    for (const id of found.alive) ids.add(id);
    for (const id of found.living) living.add(id);
    queue.push(...found.deeper);
  }
  return { ids, living };
}
async function attachSources(fetcher, id) {
  const refs = entityRefsSchema.parse(await fetcher.sourceRefs(id));
  const sourceIds = refs.entityRefs.filter((r) => r.value.type === "SOURCE").map((r) => r.value.uri);
  if (sourceIds.length === 0) return [];
  const links = sourceLinksSchema.parse(await fetcher.sourceLinks(sourceIds));
  return links.sources.flatMap((s) => {
    const title = s.title?.trim();
    if (title === void 0 || title === "") return [];
    const date = s.event?.originalDate?.trim();
    return [
      {
        id: s.id,
        title,
        url: s.uri?.uri ?? null,
        date: date === void 0 || date === "" ? null : date
      }
    ];
  });
}
async function crawlTrees(fetcher, roots, options) {
  const judged = /* @__PURE__ */ new Map();
  const judge = async (id) => {
    const known = judged.get(id);
    if (known !== void 0) return known;
    const reply = await fetcher.details(id);
    if (reply === null) throw new Error(`no details for ${id}`);
    const details = detailsSchema.parse(reply);
    const state = livingOf(details, options.referenceYear);
    let result;
    if (state === "dead" || options.allow?.has(id) === true) {
      const person = readPerson(details);
      const sources = (details.sourceCount ?? 0) > 0 ? await attachSources(fetcher, id) : person.sources;
      result = { kind: "person", person: { ...person, sources } };
    } else {
      result = {
        kind: "excluded",
        excluded: { id, reason: state === "living" ? "living" : "unknown" }
      };
    }
    judged.set(id, result);
    return result;
  };
  const bundles = [];
  for (const root of roots) {
    const { ids, living } = await ancestorsOf(fetcher, root);
    const persons = [];
    const excluded = /* @__PURE__ */ new Map();
    for (const id of living) excluded.set(id, { id, reason: "living" });
    for (const id of ids) {
      const result = await judge(id);
      if (result.kind === "person") persons.push(result.person);
      else excluded.set(id, result.excluded);
    }
    const kept = new Set(persons.map((p) => p.id));
    bundles.push({
      root,
      fetchedAt: options.fetchedAt,
      referenceYear: options.referenceYear,
      persons: persons.map((p) => ({
        ...p,
        parents: p.parents.filter((id) => kept.has(id)),
        spouses: p.spouses.filter((s) => kept.has(s.id))
      })).toSorted((a, b) => a.id.localeCompare(b.id)),
      excluded: [...excluded.values()].toSorted((a, b) => a.id.localeCompare(b.id))
    });
  }
  return bundles;
}

// src/familysearch/tree/ingest.ts
var PERSON_URL = "https://www.familysearch.org/tree/person/details/";
var idRow = external_exports.object({ id: external_exports.number() });
var personRow = external_exports.object({ id: external_exports.number(), scan_id: external_exports.number() });
function insert(db, sql, params) {
  return Number(db.prepare(sql).run(...params).lastInsertRowid);
}
var year = (date) => Number(date.slice(0, 4));
function placesOf(bundle) {
  return bundle.persons.flatMap(
    (p) => [p.birth, p.death, ...p.spouses.map((s) => s.marriage)].flatMap(
      (e) => e?.place == null ? [] : [e.place]
    )
  );
}
var CYRILLIC = new RegExp("\\p{Script=Cyrillic}", "u");
function chooseNames(bundle) {
  const counts = /* @__PURE__ */ new Map();
  for (const place of placesOf(bundle)) {
    if (place.id === null) continue;
    const names = counts.get(place.id) ?? /* @__PURE__ */ new Map();
    names.set(place.name, (names.get(place.name) ?? 0) + 1);
    counts.set(place.id, names);
  }
  const out = /* @__PURE__ */ new Map();
  for (const [id, names] of counts) {
    const ranked = [...names].toSorted(
      (a, b) => Number(CYRILLIC.test(b[0])) - Number(CYRILLIC.test(a[0])) || b[1] - a[1] || a[0].localeCompare(b[0])
    );
    const [first] = ranked;
    if (first !== void 0) out.set(id, { name: first[0], variants: ranked.map(([n]) => n) });
  }
  return out;
}
function ingestTree(db, runId, bundle) {
  return inTransaction(db, () => {
    const counts = { persons: 0, known: 0, events: 0, ties: 0, places: 0, attributes: 0 };
    const local = /* @__PURE__ */ new Map();
    const scanOf = (person) => {
      const found = selectRows(db, idRow, "select id from scan where name = ?", [person.id])[0];
      return found?.id ?? insert(db, "insert into scan (name, url, width, height) values (?, ?, 1, 1)", [
        person.id,
        `${PERSON_URL}${person.id}`
      ]);
    };
    const attribute = (scan, type, owner, ownerId, value) => {
      insert(
        db,
        `insert into attribute (run_id, scan_id, type, ${owner}, value) values (?, ?, ?, ?, ?)`,
        [runId, scan, type, ownerId, value]
      );
      counts.attributes += 1;
    };
    const chosen = chooseNames(bundle);
    const dictionary = db.prepare(
      "insert or ignore into dict_entry (kind, word, canon, note) values ('place', ?, ?, ?)"
    );
    const placeCache = /* @__PURE__ */ new Map();
    const placeOf = (place, scan) => {
      if (place === null) return null;
      const name = (place.id === null ? void 0 : chosen.get(place.id)?.name) ?? place.name;
      const cached = placeCache.get(name);
      if (cached !== void 0) return cached;
      const key = place.id === null ? null : `FamilySearch place ${String(place.id)}`;
      const known = key === null ? void 0 : selectRows(
        db,
        external_exports.object({ canon: external_exports.string() }),
        "select canon from dict_entry where kind = 'place' and word = ? and canon is not null",
        [key]
      )[0]?.canon;
      const existing = selectRows(db, idRow, "select id from place where name = ? limit 1", [
        known ?? name
      ])[0];
      if (existing !== void 0) {
        placeCache.set(name, existing.id);
        return existing.id;
      }
      const id = insert(db, "insert into place (run_id, scan_id, name) values (?, ?, ?)", [
        runId,
        scan,
        name
      ]);
      counts.places += 1;
      placeCache.set(name, id);
      if (key !== null) dictionary.run(key, name, "FamilySearch place id");
      for (const variant of place.id === null ? [] : chosen.get(place.id)?.variants ?? []) {
        if (variant !== name) dictionary.run(variant, name, "FamilySearch variant");
      }
      const facts = [
        place.standard === null ? null : `FamilySearch: ${place.standard}`,
        place.id === null ? null : `id ${String(place.id)}`,
        place.latitude === null || place.longitude === null ? null : `${String(place.latitude)}, ${String(place.longitude)}`
      ].filter((part) => part !== null);
      if (facts.length > 0) attribute(scan, "note", "place_id", id, facts.join("; "));
      return id;
    };
    const writeEvent = (type, main, scan, event) => {
      const id = insert(
        db,
        `insert into event (run_id, scan_id, type, main_person_id, year, place_id, date_from, date_to, date_qual)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          runId,
          scan,
          type,
          main,
          event.date === null ? null : year(event.date.from),
          placeOf(event.place, scan),
          event.date?.from ?? null,
          event.date?.to ?? null,
          event.date?.qual ?? null
        ]
      );
      counts.events += 1;
      if (event.dateText !== null)
        attribute(scan, "note", "event_id", id, `Date as written: ${event.dateText}`);
      return id;
    };
    const birthEvents = /* @__PURE__ */ new Map();
    for (const person of bundle.persons) {
      const existing = selectRows(
        db,
        personRow,
        "select p.id, p.scan_id from person p join scan s on s.id = p.scan_id where s.name = ?",
        [person.id]
      )[0];
      if (existing !== void 0) {
        local.set(person.id, { person: existing.id, scan: existing.scan_id });
        counts.known += 1;
        continue;
      }
      const scan = scanOf(person);
      const birth = person.birth?.date ?? null;
      const id = insert(
        db,
        `insert into person (run_id, scan_id, gender, given, patronymic, surname, birth_from, birth_to, birth_qual)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          runId,
          scan,
          person.gender,
          person.given,
          person.patronymic,
          person.surname,
          birth === null ? null : year(birth.from),
          birth === null ? null : year(birth.to),
          birth?.qual ?? null
        ]
      );
      counts.persons += 1;
      local.set(person.id, { person: id, scan });
      for (const [kind, text] of [
        ["given", person.given],
        ["patronymic", person.patronymic],
        ["surname", person.surname]
      ]) {
        if (text === null) continue;
        insert(
          db,
          "insert into name_mention (run_id, scan_id, person_id, kind, text) values (?, ?, ?, ?, ?)",
          [runId, scan, id, kind, text]
        );
      }
      if (person.latin !== null) attribute(scan, "note", "person_id", id, `Latin: ${person.latin}`);
      for (const source of person.sources) {
        const title = source.date === null ? source.title : `${source.title}, ${source.date}`;
        if (source.url === null) attribute(scan, "note", "person_id", id, title);
        else
          attribute(
            scan,
            "url",
            "person_id",
            id,
            `[${title.replaceAll(/[[\]]/g, "")}](${source.url})`
          );
      }
      if (person.birth !== null)
        birthEvents.set(person.id, writeEvent("birth", id, scan, person.birth));
      if (person.death !== null) writeEvent("death", id, scan, person.death);
    }
    const hasTie = (a, b, type) => selectRows(
      db,
      idRow,
      "select id from tie where type = ?1 and ((person_id = ?2 and other_id = ?3) or (?1 = 'spouse' and person_id = ?3 and other_id = ?2)) limit 1",
      [type, a, b]
    ).length > 0;
    const tie = (scan, a, b, type, event) => {
      if (a === b || hasTie(a, b, type)) return;
      insert(
        db,
        "insert into tie (run_id, scan_id, person_id, other_id, type, event_id) values (?, ?, ?, ?, ?, ?)",
        [runId, scan, a, b, type, event]
      );
      counts.ties += 1;
    };
    for (const person of bundle.persons) {
      const me = local.get(person.id);
      if (me === void 0) continue;
      for (const parentId of person.parents) {
        const parent = local.get(parentId);
        if (parent !== void 0)
          tie(me.scan, me.person, parent.person, "child", birthEvents.get(person.id) ?? null);
      }
      for (const spouse of person.spouses) {
        const other = local.get(spouse.id);
        if (other === void 0 || hasTie(me.person, other.person, "spouse")) continue;
        const marriage = spouse.marriage === null ? null : writeEvent("marriage", me.person, me.scan, spouse.marriage);
        tie(me.scan, me.person, other.person, "spouse", marriage);
      }
    }
    return counts;
  });
}

// src/familysearch/tree/model.ts
var treeDateSchema = external_exports.strictObject({
  /** First and last day, `YYYY-MM-DD`. */
  from: external_exports.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: external_exports.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  qual: external_exports.enum(DATE_QUALS)
});
var treePlaceSchema = external_exports.strictObject({
  /** The FamilySearch standard place id: the same id is the same place. */
  id: external_exports.int().nullable(),
  /** The place as the contributor wrote it. */
  name: external_exports.string().min(1),
  /** The FamilySearch standardised name (Latin letters). */
  standard: external_exports.string().min(1).nullable(),
  latitude: external_exports.number().nullable(),
  longitude: external_exports.number().nullable()
});
var treeEventSchema = external_exports.strictObject({
  date: treeDateSchema.nullable(),
  /** The date as written, kept when it is not read into bounds (before, after, a range …). */
  dateText: external_exports.string().min(1).nullable(),
  place: treePlaceSchema.nullable()
});
var treePersonSchema = external_exports.strictObject({
  /** The FamilySearch person id, e.g. `GG22-75Z`. */
  id: external_exports.string().regex(/^[0-9A-Z]{4}-[0-9A-Z]{3,4}$/),
  gender: external_exports.enum(GENDERS).nullable(),
  given: external_exports.string().min(1).nullable(),
  patronymic: external_exports.string().min(1).nullable(),
  surname: external_exports.string().min(1).nullable(),
  /** The name in Latin letters FamilySearch keeps beside the Ukrainian one. */
  latin: external_exports.string().min(1).nullable(),
  birth: treeEventSchema.nullable(),
  death: treeEventSchema.nullable(),
  /** Ids of the parents (both parents of every family the person is a child in). */
  parents: external_exports.array(external_exports.string()),
  spouses: external_exports.array(external_exports.strictObject({ id: external_exports.string(), marriage: treeEventSchema.nullable() })),
  /** Sources attached to the person in the tree (archive records and the like). */
  sources: external_exports.array(
    external_exports.strictObject({
      id: external_exports.string(),
      title: external_exports.string().min(1),
      url: external_exports.string().min(1).nullable(),
      date: external_exports.string().min(1).nullable()
    })
  )
});
var excludedSchema = external_exports.strictObject({
  id: external_exports.string(),
  reason: external_exports.enum(["living", "unknown"])
});
var treeBundleSchema = external_exports.strictObject({
  root: external_exports.string(),
  /** ISO time of the fetch. */
  fetchedAt: external_exports.string(),
  /** The year the living rule counted from. */
  referenceYear: external_exports.int(),
  persons: external_exports.array(treePersonSchema),
  excluded: external_exports.array(excludedSchema)
});

// src/familysearch/tree/cli.ts
var USAGE = `usage: pnpm familysearch:tree <fetch|ingest> <case dir> [options]
  fetch  --root ID [--root ID \u2026] [--allow ID \u2026]
  ingest --model M`;
var { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    root: { type: "string", multiple: true, default: [] },
    allow: { type: "string", multiple: true, default: [] },
    model: { type: "string" }
  }
});
var [command, caseDir] = positionals;
if (command === void 0 || caseDir === void 0) {
  console.error(USAGE);
  process.exit(2);
}
switch (command) {
  case "fetch": {
    const [first] = values.root;
    if (first === void 0) throw new Error("--root is required");
    const now = /* @__PURE__ */ new Date();
    const bundles = await withFamilySearch(
      first,
      (fetcher) => crawlTrees(fetcher, values.root, {
        referenceYear: now.getUTCFullYear(),
        fetchedAt: now.toISOString(),
        allow: new Set(values.allow)
      })
    );
    mkdirSync(join(caseDir, "raw"), { recursive: true });
    for (const bundle of bundles) {
      writeFileSync(
        join(caseDir, "raw", `tree-${bundle.root}.json`),
        JSON.stringify(bundle, null, 1)
      );
      const reasons = Object.groupBy(bundle.excluded, (e) => e.reason);
      console.log(
        `${bundle.root}: ${String(bundle.persons.length)} persons, kept out: ${String(reasons.living?.length ?? 0)} living, ${String(reasons.unknown?.length ?? 0)} unknown`
      );
    }
    break;
  }
  case "ingest": {
    if (values.model === void 0) throw new Error("--model is required");
    const operator = requireOperator();
    const db = openCaseDb(join(caseDir, "case.sqlite"));
    db.prepare(
      "insert or ignore into meta (key, value) values ('kind', 'familysearch-tree')"
    ).run();
    const done = new Set(
      selectRows(
        db,
        external_exports.object({ note: external_exports.string() }),
        "select note from run where note is not null"
      ).map((r) => r.note)
    );
    const files = readdirSync(join(caseDir, "raw")).filter((f) => /^tree-.+\.json$/.test(f)).toSorted();
    for (const file of files) {
      const bundle = treeBundleSchema.parse(
        JSON.parse(readFileSync(join(caseDir, "raw", file), "utf8"))
      );
      const note = `FamilySearch tree of ${bundle.root}, fetched ${bundle.fetchedAt}`;
      if (done.has(note)) {
        console.log(`${file}: already read`);
        continue;
      }
      const run = startRun(db, {
        startedAt: (/* @__PURE__ */ new Date()).toISOString(),
        model: values.model,
        operator,
        note
      });
      console.log(`${file}: run ${String(run)} ${JSON.stringify(ingestTree(db, run, bundle))}`);
    }
    break;
  }
  default:
    console.error(USAGE);
    process.exit(2);
}
