// No living persons in ddb (docs/genealogy/ddm.md, section 3).
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, rolledBack, scalar } from "../db.ts";
import { addParticipant, newEvent, newFamily, newPerson } from "./helpers.ts";

let client: pg.Client;
beforeAll(async () => {
  client = await connect();
});
afterAll(async () => {
  await client.end();
});

const living = /may be a living person/;
const bare = () =>
  scalar(client, "insert into ddb.person (gender) values ('male') returning id as v");

describe("living persons", () => {
  it("rejects a person without any event", async () => {
    await expect(
      rolledBack(client, async () => {
        await bare();
      }),
    ).rejects.toThrow(living);
  });

  it("accepts a person born 1850", async () => {
    await rolledBack(client, async () => {
      await newPerson(client, { born: "1850" });
    });
  });

  it("rejects a person born in 2000", async () => {
    await expect(
      rolledBack(client, async () => {
        await newPerson(client, { born: "2000" });
      }),
    ).rejects.toThrow(living);
  });

  it("accepts a person with a known death, whatever the date", async () => {
    await rolledBack(client, async () => {
      const p = await bare();
      await addParticipant(client, await newEvent(client, "death", "2001"), p, "primary");
    });
  });

  it("puts the cutoff 75 years before the current year", async () => {
    expect(
      await scalar(
        client,
        "select extract(year from current_date)::int - ddb.living_cutoff_year() as v",
      ),
    ).toBe(75);
  });

  it("accepts a witness of an event up to the cutoff year", async () => {
    await rolledBack(client, async () => {
      const cutoff = await scalar(client, "select ddb.living_cutoff_year() as v");
      const p = await bare();
      await addParticipant(
        client,
        await newEvent(client, "marriage", String(cutoff)),
        p,
        "witness",
      );
    });
  });

  it("rejects an event whose latest possible date is after the cutoff", async () => {
    await expect(
      rolledBack(client, async () => {
        const cutoff = await scalar(client, "select ddb.living_cutoff_year() as v");
        const p = await bare();
        await addParticipant(
          client,
          await newEvent(client, "census", `ABT ${String(cutoff)}`),
          p,
          "primary",
        );
      }),
    ).rejects.toThrow(living);
  });

  it("does not count an undated event or one with an open end", async () => {
    await expect(
      rolledBack(client, async () => {
        const p = await bare();
        await addParticipant(client, await newEvent(client, "census", "(undated)"), p, "primary");
        await addParticipant(client, await newEvent(client, "residence", "AFT 1850"), p, "primary");
      }),
    ).rejects.toThrow(living);
  });

  it("accepts a partner of a family with an old family event", async () => {
    await rolledBack(client, async () => {
      const p = await bare();
      const f = await newFamily(client, p, null);
      const e = await newEvent(client, "marriage", "1870");
      await client.query(
        "insert into ddb.participant (event, family, role) values ($1, $2, 'primary')",
        [e, f],
      );
    });
  });

  it("rejects removing the only evidence", async () => {
    await expect(
      rolledBack(client, async () => {
        const p = await newPerson(client);
        await client.query("set constraints all immediate");
        await client.query("set constraints all deferred");
        await client.query("delete from ddb.participant where person = $1", [p]);
      }),
    ).rejects.toThrow(living);
  });

  it("rejects moving the only event into living memory", async () => {
    await expect(
      rolledBack(client, async () => {
        const p = await newPerson(client);
        await client.query("set constraints all immediate");
        await client.query("set constraints all deferred");
        await client.query(
          "update ddb.event set date = '1990' where id in (select event from ddb.participant where person = $1)",
          [p],
        );
      }),
    ).rejects.toThrow(living);
  });

  it("rejects removing a partner from the family that holds their only evidence", async () => {
    await expect(
      rolledBack(client, async () => {
        const p = await bare();
        const f = await newFamily(client, p, null);
        const e = await newEvent(client, "marriage", "1870");
        await client.query(
          "insert into ddb.participant (event, family, role) values ($1, $2, 'primary')",
          [e, f],
        );
        await client.query("set constraints all immediate");
        await client.query("set constraints all deferred");
        await client.query("update ddb.family set partner1 = null where id = $1", [f]);
      }),
    ).rejects.toThrow(living);
  });
});
