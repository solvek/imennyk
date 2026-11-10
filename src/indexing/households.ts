// Fills `person.event_id` of a database made before the column existed: members of a household
// were inserted one after another, a head first, so a household is the persons from its head to the
// next head of the same scan; persons before the first head of a scan continue the last household
// of the earlier scan. The result is checked against the ties of the households.
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { inTransaction, selectRows } from "./db.ts";

const personRow = z.object({
  id: z.number(),
  scan_id: z.number(),
  event_id: z.number().nullable(),
});
const eventRow = z.object({ id: z.number(), scan_id: z.number(), main_person_id: z.number() });
const tieRow = z.object({ person_id: z.number(), other_id: z.number(), event_id: z.number() });

/** Sets `event_id` of persons that have none; returns how many were set. */
export function fillHouseholds(db: DatabaseSync): number {
  const persons = selectRows(
    db,
    personRow,
    "select id, scan_id, event_id from person where event_id is null order by id",
  );
  if (persons.length === 0) return 0;
  const events = selectRows(
    db,
    eventRow,
    "select id, scan_id, main_person_id from event where main_person_id is not null order by main_person_id",
  );
  const all = selectRows(db, personRow, "select id, scan_id, event_id from person order by id");
  // A person who already has a household keeps it. The scan order of person ids is the order the
  // scans were ingested, which is not always the order of the images, so a household continued
  // from an earlier image cannot be rebuilt from the id order.
  const stored = new Map(
    all.flatMap((person) => (person.event_id === null ? [] : [[person.id, person.event_id]])),
  );
  const scanOrder = [...new Set(all.map((p) => p.scan_id))];
  const eventOf = new Map<number, number>();
  let lastEvent: number | undefined;
  for (const scan of scanOrder) {
    const inScan = all.filter((p) => p.scan_id === scan);
    const heads = events.filter((e) => e.scan_id === scan);
    let current = lastEvent;
    for (const person of inScan) {
      const head = heads.find((e) => e.main_person_id === person.id);
      const known = stored.get(person.id);
      if (head !== undefined) current = head.id;
      else if (known !== undefined) current = known;
      if (current === undefined) throw new Error(`person ${String(person.id)} has no household`);
      eventOf.set(person.id, known ?? current);
    }
    lastEvent = heads.at(-1)?.id ?? lastEvent;
  }
  for (const tie of selectRows(
    db,
    tieRow,
    "select person_id, other_id, event_id from tie where event_id is not null",
  )) {
    const personEvent = stored.get(tie.person_id) ?? eventOf.get(tie.person_id);
    const otherEvent = stored.get(tie.other_id) ?? eventOf.get(tie.other_id);
    if (personEvent !== tie.event_id || otherEvent !== tie.event_id) {
      throw new Error(
        `tie of persons ${String(tie.person_id)} and ${String(tie.other_id)} is outside its household`,
      );
    }
  }
  inTransaction(db, () => {
    const set = db.prepare("update person set event_id = ? where id = ? and event_id is null");
    for (const person of persons) {
      const event = eventOf.get(person.id);
      if (event !== undefined) set.run(event, person.id);
    }
  });
  return persons.length;
}
