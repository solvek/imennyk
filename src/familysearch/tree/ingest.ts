// Writes a fetched tree into the case database, in the same tables an indexing run uses: a scan is
// the person's page in the tree (it has no picture, so 1×1), a person, their birth, death and
// marriage events, ties of kin, attributes. Nothing is a doubt and there is no sample: the data
// are typed, not read. A person already in the case (met in another tree) is not written twice.
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { inTransaction, selectRows } from "../../indexing/db.ts";
import type { TreeBundle, TreeEvent, TreePerson, TreePlace } from "./model.ts";

export const PERSON_URL = "https://www.familysearch.org/tree/person/details/";

export interface TreeIngestResult {
  readonly persons: number;
  /** Persons of the bundle that the case already had. */
  readonly known: number;
  readonly events: number;
  readonly ties: number;
  readonly places: number;
  readonly attributes: number;
}

const idRow = z.object({ id: z.number() });
const personRow = z.object({ id: z.number(), scan_id: z.number() });

function insert(db: DatabaseSync, sql: string, params: (string | number | null)[]): number {
  return Number(db.prepare(sql).run(...params).lastInsertRowid);
}

const year = (date: string): number => Number(date.slice(0, 4));

/** Every place of the events of a bundle. */
function placesOf(bundle: TreeBundle): TreePlace[] {
  return bundle.persons.flatMap((p) =>
    [p.birth, p.death, ...p.spouses.map((s) => s.marriage)].flatMap((e) =>
      e?.place == null ? [] : [e.place],
    ),
  );
}

const CYRILLIC = /\p{Script=Cyrillic}/u;

/**
 * The name of each FamilySearch place id and its spellings. The name is the most common spelling
 * in Cyrillic, or the most common one when none is in Cyrillic.
 */
export function chooseNames(bundle: TreeBundle): Map<number, { name: string; variants: string[] }> {
  const counts = new Map<number, Map<string, number>>();
  for (const place of placesOf(bundle)) {
    if (place.id === null) continue;
    const names = counts.get(place.id) ?? new Map<string, number>();
    names.set(place.name, (names.get(place.name) ?? 0) + 1);
    counts.set(place.id, names);
  }
  const out = new Map<number, { name: string; variants: string[] }>();
  for (const [id, names] of counts) {
    const ranked = [...names].toSorted(
      (a, b) =>
        Number(CYRILLIC.test(b[0])) - Number(CYRILLIC.test(a[0])) ||
        b[1] - a[1] ||
        a[0].localeCompare(b[0]),
    );
    const [first] = ranked;
    if (first !== undefined) out.set(id, { name: first[0], variants: ranked.map(([n]) => n) });
  }
  return out;
}

/** Writes `bundle` as run `runId`. All or nothing. */
export function ingestTree(db: DatabaseSync, runId: number, bundle: TreeBundle): TreeIngestResult {
  return inTransaction(db, () => {
    const counts = { persons: 0, known: 0, events: 0, ties: 0, places: 0, attributes: 0 };
    const local = new Map<string, { person: number; scan: number }>();

    const scanOf = (person: TreePerson): number => {
      const found = selectRows(db, idRow, "select id from scan where name = ?", [person.id])[0];
      return (
        found?.id ??
        insert(db, "insert into scan (name, url, width, height) values (?, ?, 1, 1)", [
          person.id,
          `${PERSON_URL}${person.id}`,
        ])
      );
    };
    const attribute = (
      scan: number,
      type: string,
      owner: "person_id" | "event_id" | "place_id",
      ownerId: number,
      value: string,
    ): void => {
      insert(
        db,
        `insert into attribute (run_id, scan_id, type, ${owner}, value) values (?, ?, ?, ?, ?)`,
        [runId, scan, type, ownerId, value],
      );
      counts.attributes += 1;
    };

    // A place is one row per FamilySearch place id: the same id is written in several ways
    // (Cyrillic, Latin, a Polish form). The most common Cyrillic way names the place; the others
    // go to the dictionary of the case. What FamilySearch knows of the place hangs on it as a note.
    const chosen = chooseNames(bundle);
    const dictionary = db.prepare(
      "insert or ignore into dict_entry (kind, word, canon, note) values ('place', ?, ?, ?)",
    );
    const placeCache = new Map<string, number>();
    const placeOf = (place: TreePlace | null, scan: number): number | null => {
      if (place === null) return null;
      const name = (place.id === null ? undefined : chosen.get(place.id)?.name) ?? place.name;
      const cached = placeCache.get(name);
      if (cached !== undefined) return cached;
      const key = place.id === null ? null : `FamilySearch place ${String(place.id)}`;
      const known =
        key === null
          ? undefined
          : selectRows(
              db,
              z.object({ canon: z.string() }),
              "select canon from dict_entry where kind = 'place' and word = ? and canon is not null",
              [key],
            )[0]?.canon;
      const existing = selectRows(db, idRow, "select id from place where name = ? limit 1", [
        known ?? name,
      ])[0];
      if (existing !== undefined) {
        placeCache.set(name, existing.id);
        return existing.id;
      }
      const id = insert(db, "insert into place (run_id, scan_id, name) values (?, ?, ?)", [
        runId,
        scan,
        name,
      ]);
      counts.places += 1;
      placeCache.set(name, id);
      if (key !== null) dictionary.run(key, name, "FamilySearch place id");
      for (const variant of place.id === null ? [] : (chosen.get(place.id)?.variants ?? [])) {
        if (variant !== name) dictionary.run(variant, name, "FamilySearch variant");
      }
      const facts = [
        place.standard === null ? null : `FamilySearch: ${place.standard}`,
        place.id === null ? null : `id ${String(place.id)}`,
        place.latitude === null || place.longitude === null
          ? null
          : `${String(place.latitude)}, ${String(place.longitude)}`,
      ].filter((part) => part !== null);
      if (facts.length > 0) attribute(scan, "note", "place_id", id, facts.join("; "));
      return id;
    };

    const writeEvent = (
      type: "birth" | "death" | "marriage",
      main: number,
      scan: number,
      event: TreeEvent,
    ): number => {
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
          event.date?.qual ?? null,
        ],
      );
      counts.events += 1;
      if (event.dateText !== null)
        attribute(scan, "note", "event_id", id, `Date as written: ${event.dateText}`);
      return id;
    };

    const birthEvents = new Map<string, number>();
    for (const person of bundle.persons) {
      const existing = selectRows(
        db,
        personRow,
        "select p.id, p.scan_id from person p join scan s on s.id = p.scan_id where s.name = ?",
        [person.id],
      )[0];
      if (existing !== undefined) {
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
          birth?.qual ?? null,
        ],
      );
      counts.persons += 1;
      local.set(person.id, { person: id, scan });
      for (const [kind, text] of [
        ["given", person.given],
        ["patronymic", person.patronymic],
        ["surname", person.surname],
      ] as const) {
        if (text === null) continue;
        insert(
          db,
          "insert into name_mention (run_id, scan_id, person_id, kind, text) values (?, ?, ?, ?, ?)",
          [runId, scan, id, kind, text],
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
            `[${title.replaceAll(/[[\]]/g, "")}](${source.url})`,
          );
      }
      if (person.birth !== null)
        birthEvents.set(person.id, writeEvent("birth", id, scan, person.birth));
      if (person.death !== null) writeEvent("death", id, scan, person.death);
    }

    const hasTie = (a: number, b: number, type: string): boolean =>
      selectRows(
        db,
        idRow,
        "select id from tie where type = ?1 and ((person_id = ?2 and other_id = ?3) or (?1 = 'spouse' and person_id = ?3 and other_id = ?2)) limit 1",
        [type, a, b],
      ).length > 0;
    const tie = (scan: number, a: number, b: number, type: string, event: number | null): void => {
      if (a === b || hasTie(a, b, type)) return;
      insert(
        db,
        "insert into tie (run_id, scan_id, person_id, other_id, type, event_id) values (?, ?, ?, ?, ?, ?)",
        [runId, scan, a, b, type, event],
      );
      counts.ties += 1;
    };
    for (const person of bundle.persons) {
      const me = local.get(person.id);
      if (me === undefined) continue;
      for (const parentId of person.parents) {
        const parent = local.get(parentId);
        if (parent !== undefined)
          tie(me.scan, me.person, parent.person, "child", birthEvents.get(person.id) ?? null);
      }
      for (const spouse of person.spouses) {
        const other = local.get(spouse.id);
        if (other === undefined || hasTie(me.person, other.person, "spouse")) continue;
        const marriage =
          spouse.marriage === null
            ? null
            : writeEvent("marriage", me.person, me.scan, spouse.marriage);
        tie(me.scan, me.person, other.person, "spouse", marriage);
      }
    }
    return counts;
  });
}
