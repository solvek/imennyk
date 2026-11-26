// A compact text notation for reading a confession list: one line per person, turned into the
// JSON of `reading.ts`. The agent writes less, and boxes, serial numbers, household numbers and
// ties follow the rules of skills/imennyk/references/document-types/confession.md instead of being typed per person.
//
// Lines (blank lines and «#» comments are ignored):
//   scan 435                      the scan name (required, first)
//   year 1912
//   place Владимиръ settlement    the place of the households that follow (name and optional type); a later `place` line starts another place
//   cols L 1068 1955              x range (scan px) of the name column of page L; R likewise
//   page L                        the page the following rows are on
//   section Духовные              status attribute of the households that begin from here on
//   house 12                      the number written at the head of the next household (without it the number is derived)
//   cont 434 h27 [spouse]         the first rows continue household h27 of scan 434 (no head)
//   printed 24 20                 check: the counters of men and women after the previous row
//   snote text                    attribute `note` of the scan
//   1850;H;m;Иванъ;Петровъ;Сидоровъ;44;;note     person: y;role;gender;given;patronymic;surname;age;serial;note
//   1850-1940;…                   y may be a range for a name on two lines
//   ! surname;read;variants;note  doubt about a word of the last person
// Roles: H head; W wife (spouse of the head); S/D/C child of the head and of his first wife (son,
// daughter, child — the gender field says which); s/d/c child of the head only; K:relation:up:down
// another kin of the head (when the member is of the older line, down greater than up, the tie is written
// from the head); P a parent of the head; N a member whose kinship the row does not name (no tie).
// W, S, D, C, s, d, c, P take «@y» to tie the person to another member of the
// household instead of the head, the row that begins at that y: W@1200 the wife of that man, S@1200 a
// child of that person and of the spouse, s@1200 a child of that person only. Gender is m or f. `serial` is empty (counted) or the printed number. A serial of `-` means the person has no number in the counters (not counted). The last field: `occ:<occupation>`, `rel:<religion>` and/or notes, separated by «|».
import { type Reading, readingSchema } from "./reading.ts";

export interface CompactOptions {
  /** Counters of men and women printed before the first row (the last of the previous scan). */
  readonly start: { readonly m: number; readonly f: number };
}

export interface CompactSummary {
  readonly persons: number;
  readonly males: number;
  readonly females: number;
  readonly households: number;
  readonly lastHousehold: string;
  readonly lastHeadHasSpouse: boolean;
  readonly counters: { readonly m: number; readonly f: number };
}

type Gender = "male" | "female";
interface Member {
  key: string;
  head: boolean;
  given?: string;
  patronymic?: string;
  surname?: string;
  gender: Gender;
  age?: number | string;
  box: { x: number; y: number; w: number; h: number; origin: "crop" };
  attributes: { type: string; value: string }[];
}
interface Tie {
  person: string;
  other: string;
  type: "child" | "spouse" | "kin";
  relation?: string;
  up?: number;
  down?: number;
}
interface Household {
  key: string;
  number?: string;
  place?: string;
  attributes: { type: string; value: string }[];
  members: Member[];
  ties: Tie[];
  continues?: { scan: string; household: string };
  box?: { x: number; y: number; w: number; h: number; origin: "crop" };
}

const ROW_HEIGHT = 92;

function fail(line: number, message: string): never {
  throw new Error(`line ${String(line)}: ${message}`);
}

function opt(value: string | undefined): string | undefined {
  const text = value?.trim();
  return text === undefined || text === "" ? undefined : text;
}

/** Turns the compact notation of one scan into a reading; throws a message with the line number. */
export function compactToReading(
  text: string,
  options: CompactOptions,
): { reading: Reading; summary: CompactSummary } {
  let scan: string | undefined;
  let year: number | undefined;
  const places: { key: string; name: string; type?: string }[] = [];
  let currentPlace: string | undefined;
  const cols = new Map<string, readonly [number, number]>();
  let page: string | undefined;
  let section: string | undefined;
  let pendingCont: { scan: string; household: string; spouse: boolean } | undefined;
  let pendingHouse: string | undefined;
  const scanNotes: string[] = [];
  const households: Household[] = [];
  const doubts: Record<string, unknown>[] = [];
  const counters = { m: options.start.m, f: options.start.f };
  let last: Member | undefined;
  // The rows map finds a member by the y of its row; partners holds the spouse of a member, both ways.
  let current:
    | {
        household: Household;
        head?: Member;
        wife?: Member;
        rows: Map<number, Member>;
        partners: Map<string, Member>;
      }
    | undefined;
  let continued = false;
  let persons = 0;

  text.split("\n").forEach((raw, index) => {
    const n = index + 1;
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) return;
    const [word = "", ...restParts] = line.split(/\s+/);
    const rest = restParts.join(" ");
    if (/^\d/.test(word)) {
      if (page === undefined || !cols.has(page)) fail(n, "a row needs `cols` and `page` before it");
      const [yRaw = "", role = "", g = "", given, patronymic, surname, age, serial, note] = line
        .split(";")
        .map((part) => part.trim());
      const yParts = yRaw.split("-").map(Number);
      const yFrom = yParts[0];
      const yTo = yParts[1] ?? yParts[0];
      if (
        yFrom === undefined ||
        yTo === undefined ||
        !Number.isFinite(yFrom) ||
        !Number.isFinite(yTo)
      ) {
        fail(n, `bad y «${yRaw}»`);
      }
      const at = role.indexOf("@");
      const roleName = at === -1 ? role : role.slice(0, at);
      const refY = at === -1 ? undefined : Number(role.slice(at + 1));
      const gender: Gender | undefined = g === "m" ? "male" : g === "f" ? "female" : undefined;
      if (gender === undefined) fail(n, `gender must be m or f, not «${g}»`);
      const [x0, x1] = cols.get(page) ?? [0, 0];
      const centre = (yFrom + yTo) / 2;
      const half = Math.max(ROW_HEIGHT / 2, (yTo - yFrom) / 2 + 10);
      const box = {
        x: x0,
        y: Math.max(0, Math.round(centre - half)),
        w: x1 - x0,
        h: Math.round(half * 2),
        origin: "crop" as const,
      };
      const printedSerial = opt(serial);
      const counted = printedSerial !== "-";
      if (counted) {
        if (gender === "male") counters.m += 1;
        else counters.f += 1;
      }
      if (printedSerial !== undefined && counted) {
        const value = Number(printedSerial);
        if (!Number.isInteger(value)) fail(n, `bad serial «${printedSerial}»`);
        if (gender === "male") counters.m = value;
        else counters.f = value;
      }
      const ageValue = opt(age);
      const member: Member = {
        key: `p${String(persons)}`,
        head: role === "H",
        gender,
        box,
        attributes: counted
          ? [{ type: "serial", value: String(gender === "male" ? counters.m : counters.f) }]
          : [],
      };
      for (const part of [given, patronymic, surname]) {
        if (part !== undefined && /[A-Za-z]/.test(part))
          fail(n, `Latin letters in a name: «${part}»`);
      }
      const g1 = opt(given);
      const p1 = opt(patronymic);
      const s1 = opt(surname);
      if (g1 !== undefined) member.given = g1;
      if (p1 !== undefined) member.patronymic = p1;
      if (s1 !== undefined) member.surname = s1;
      if (ageValue !== undefined) member.age = /^\d+$/.test(ageValue) ? Number(ageValue) : ageValue;
      // The last field holds `occ:<occupation>` and/or notes, separated by «|».
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
        const household: Household = {
          key: `h${String(households.length + 1)}`,
          number: pendingHouse ?? String(number),
          attributes:
            pendingHouse === undefined
              ? [{ type: "note", value: "Номер двору виведено: біля двору не надруковано" }]
              : [],
          members: [member],
          ties: [],
          box,
          ...(currentPlace === undefined ? {} : { place: currentPlace }),
        };
        if (section !== undefined) household.attributes.push({ type: "status", value: section });
        households.push(household);
        current = {
          household,
          head: member,
          rows: new Map([[yFrom, member]]),
          partners: new Map(),
        };
        pendingHouse = undefined;
        continued = false;
      } else {
        if (current === undefined) {
          if (pendingCont === undefined) fail(n, "a row without head needs `cont` before it");
          const target = pendingCont;
          const household: Household = {
            key: `h${String(households.length + 1)}`,
            attributes: [],
            members: [],
            ties: [],
            continues: { scan: target.scan, household: target.household },
            box,
          };
          households.push(household);
          current = { household, rows: new Map(), partners: new Map() };
          continued = true;
        }
        const { household, rows, partners } = current;
        let target: Member | undefined;
        if (refY !== undefined) {
          if (!/^[WSDCsdcP]$/.test(roleName)) fail(n, `«@» does not go with the role «${role}»`);
          target = rows.get(refY);
          if (target === undefined) fail(n, `no row at y ${String(refY)} in this household`);
        }
        household.members.push(member);
        rows.set(yFrom, member);
        if (household.box !== undefined) {
          const top = Math.min(household.box.y, box.y);
          const bottom = Math.max(household.box.y + household.box.h, box.y + box.h);
          household.box = { ...household.box, y: top, h: bottom - top };
        }
        const headRef = continued ? "@head" : current.head?.key;
        if (headRef === undefined) fail(n, "household without head");
        const add = (tie: Tie): void => {
          household.ties.push(tie);
        };
        const spouseRef = continued
          ? pendingCont?.spouse === true && current.wife === undefined
            ? "@spouse"
            : current.wife?.key
          : current.wife?.key;
        if (target !== undefined) {
          if (roleName === "W") {
            add({ person: member.key, other: target.key, type: "spouse" });
            if (!partners.has(target.key)) partners.set(target.key, member);
            partners.set(member.key, target);
          } else if (roleName === "P") {
            add({ person: target.key, other: member.key, type: "child" });
          } else {
            add({ person: member.key, other: target.key, type: "child" });
            const partner = partners.get(target.key);
            if (/^[SDC]$/.test(roleName) && partner !== undefined) {
              add({ person: member.key, other: partner.key, type: "child" });
            }
          }
        } else if (role === "W") {
          add({ person: member.key, other: headRef, type: "spouse" });
          current.wife ??= member;
          if (current.head !== undefined && !partners.has(current.head.key)) {
            partners.set(current.head.key, member);
            partners.set(member.key, current.head);
          }
        } else if (role === "S" || role === "D" || role === "C") {
          add({ person: member.key, other: headRef, type: "child" });
          if (spouseRef !== undefined) add({ person: member.key, other: spouseRef, type: "child" });
        } else if (role === "s" || role === "d" || role === "c") {
          add({ person: member.key, other: headRef, type: "child" });
        } else if (role === "P") {
          add({ person: headRef, other: member.key, type: "child" });
        } else if (role === "N") {
          // The row names no kinship: the person is a member of the household without a tie.
        } else if (role.startsWith("K:")) {
          const [, relation = "", up = "", down = ""] = role.split(":");
          // A tie of kin is counted from the younger line: steps up to the common ancestor, then down.
          const older = up !== "" && down !== "" && Number(up) < Number(down);
          const tie: Tie = older
            ? { person: headRef, other: member.key, type: "kin" }
            : { person: member.key, other: headRef, type: "kin" };
          if (relation !== "") tie.relation = relation;
          if (up !== "") tie[older ? "down" : "up"] = Number(up);
          if (down !== "") tie[older ? "up" : "down"] = Number(down);
          add(tie);
        } else {
          fail(n, `unknown role «${role}»`);
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
        // A new `place` line starts a new place; households that begin after it belong to it.
        const [name, type] = [rest.split(/\s+/).slice(0, -1).join(" "), rest.split(/\s+/).at(-1)];
        const typed = type !== undefined && /^[a-z]+$/.test(type) && name !== "";
        const key = `v${String(places.length + 1)}`;
        places.push({ key, name: typed ? name : rest, ...(typed ? { type } : {}) });
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
        section = rest === "" ? undefined : rest;
        return;
      case "house":
        if (rest === "") fail(n, "«house» needs the number");
        pendingHouse = rest;
        return;
      case "cont": {
        const [s = "", h = "", flag] = rest.split(/\s+/);
        pendingCont = { scan: s, household: h, spouse: flag === "spouse" };
        current = undefined;
        return;
      }
      case "printed": {
        const [m = "", f = ""] = rest.split(/\s+/);
        if (Number(m) !== counters.m || Number(f) !== counters.f) {
          fail(
            n,
            `printed counters ${m}/${f} but the rows give ${String(counters.m)}/${String(counters.f)}`,
          );
        }
        return;
      }
      case "snote":
        scanNotes.push(rest);
        return;
      case "!": {
        if (last === undefined) fail(n, "a doubt needs a person before it");
        const [element = "", read, variants, note] = rest.split(";").map((part) => part.trim());
        const doubt: Record<string, unknown> = { element, person: last.key, box: last.box };
        const r1 = opt(read);
        const v1 = opt(variants);
        const n1 = opt(note);
        if (r1 !== undefined) doubt.read = r1;
        if (v1 !== undefined) doubt.variants = v1;
        if (n1 !== undefined) doubt.note = n1;
        doubts.push(doubt);
        return;
      }
      default:
        fail(n, `unknown directive «${word}»`);
    }
  });

  if (scan === undefined || year === undefined) throw new Error("`scan` and `year` are required");
  const reading: Record<string, unknown> = {
    scan,
    year,
    places,
    households,
    doubts,
    scan_attributes: scanNotes.map((value) => ({ type: "note", value })),
  };
  const lastHousehold = households.at(-1);
  const lastHead = lastHousehold?.members.find((member) => member.head)?.key;
  const headWife =
    lastHousehold?.ties.some((tie) => tie.type === "spouse" && tie.other === lastHead) ?? false;
  return {
    reading: readingSchema.parse(reading),
    summary: {
      persons,
      males: counters.m - options.start.m,
      females: counters.f - options.start.f,
      households: households.length,
      lastHousehold: lastHousehold?.key ?? "",
      lastHeadHasSpouse: headWife,
      counters,
    },
  };
}
