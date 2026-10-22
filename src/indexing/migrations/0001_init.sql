-- Intermediate database of one archival case: what an agent read from the scans before anything
-- is entered into the well. Ids are local; `ddb_map` links them to the well once entered.

create table meta (
  key   text primary key,
  value text not null
) strict;

create table scan (
  id     integer primary key,
  name   text not null unique check (name <> ''),
  url    text not null check (url <> ''),
  width  integer not null check (width > 0),
  height integer not null check (height > 0),
  md5    text check (md5 is null or length(md5) = 32)
) strict;

-- One reading pass of an agent (or a model). Every extracted row belongs to a run.
create table run (
  id            integer primary key,
  started_at    text not null,
  model         text not null check (model <> ''),
  session       text,
  effort        text,
  procedure_sha text,
  note          text
) strict;

create table box (
  id      integer primary key,
  scan_id integer not null references scan (id),
  x       integer not null check (x >= 0),
  y       integer not null check (y >= 0),
  w       integer not null check (w > 0),
  h       integer not null check (h > 0),
  origin  text not null check (origin in ('crop', 'htr_line', 'manual')),
  wrong   integer not null default 0 check (wrong in (0, 1))
) strict;

create trigger box_in_scan_insert before insert on box
begin
  select raise(abort, 'box is outside of the scan')
   where new.x + new.w > (select width from scan where id = new.scan_id)
      or new.y + new.h > (select height from scan where id = new.scan_id);
end;

create table text_line (
  id      integer primary key,
  run_id  integer not null references run (id),
  scan_id integer not null references scan (id),
  box_id  integer references box (id),
  text    text not null check (text <> '')
) strict;

create table place (
  id      integer primary key,
  run_id  integer not null references run (id),
  scan_id integer not null references scan (id),
  box_id  integer references box (id),
  line_id integer references text_line (id),
  name    text not null check (name <> ''),
  type    text check (type is null or type in ('country', 'region', 'district', 'volost', 'parish', 'settlement', 'hamlet', 'church', 'cemetery', 'street', 'building'))
) strict;

create table person (
  id         integer primary key,
  run_id     integer not null references run (id),
  scan_id    integer not null references scan (id),
  box_id     integer references box (id),
  line_id    integer references text_line (id),
  gender     text check (gender is null or gender in ('male', 'female')),
  given      text,
  patronymic text,
  surname    text,
  age        text,
  birth_from integer,
  birth_to   integer,
  birth_qual text check (birth_qual is null or birth_qual in ('exact', 'calculated', 'estimated', 'about')),
  note       text,
  check (birth_from is null or birth_to is null or birth_from <= birth_to)
) strict;

create table event (
  id             integer primary key,
  run_id         integer not null references run (id),
  scan_id        integer not null references scan (id),
  box_id         integer references box (id),
  line_id        integer references text_line (id),
  type           text not null check (type in ('birth', 'baptism', 'marriage', 'banns', 'divorce', 'death', 'burial', 'census', 'confession', 'residence', 'occupation', 'military', 'emigration', 'education', 'property')),
  main_person_id integer references person (id),
  year           integer,
  place_id       integer references place (id),
  number         text,
  note           text
) strict;

create table tie (
  id        integer primary key,
  run_id    integer not null references run (id),
  scan_id   integer not null references scan (id),
  box_id    integer references box (id),
  line_id   integer references text_line (id),
  person_id integer not null references person (id),
  other_id  integer not null references person (id),
  type      text not null check (type in ('child', 'spouse', 'godparent', 'friend', 'witness', 'officiant', 'informant', 'mentioned', 'kin', 'relative')),
  relation  text,
  up        integer,
  down      integer,
  event_id  integer references event (id),
  check (person_id <> other_id)
) strict;

-- Every place on a scan where a name part is read; the sample of surnames picks from these.
create table name_mention (
  id        integer primary key,
  run_id    integer not null references run (id),
  scan_id   integer not null references scan (id),
  box_id    integer references box (id),
  line_id   integer references text_line (id),
  person_id integer not null references person (id),
  kind      text not null check (kind in ('given', 'patronymic', 'surname')),
  text      text not null check (text <> '')
) strict;

-- A doubtful or unreadable element; reviewers fix it.
create table doubt (
  id          integer primary key,
  run_id      integer not null references run (id),
  scan_id     integer not null references scan (id),
  box_id      integer references box (id),
  element     text not null check (element in ('surname', 'given', 'patronymic', 'age', 'gender', 'place', 'tie', 'other')),
  person_id   integer references person (id),
  place_id    integer references place (id),
  read_text   text,
  variants    text,
  unreadable  integer not null default 0 check (unreadable in (0, 1)),
  note        text,
  resolution  text,
  check (unreadable = 0 or read_text is not null)
) strict;

-- Words of this case only.
create table dict_entry (
  id    integer primary key,
  kind  text not null check (kind in ('given', 'patronymic', 'surname', 'place', 'abbreviation', 'other')),
  word  text not null check (word <> ''),
  canon text,
  note  text,
  unique (kind, word)
) strict;

-- The fixed sample for measuring errors; built once and never changed.
create table sample (
  id              integer primary key,
  name_mention_id integer not null unique references name_mention (id),
  rank            integer not null unique
) strict;

-- Local ids to the ids of the well; filled when data are entered.
create table ddb_map (
  kind     text not null check (kind in ('person', 'event', 'tie', 'place', 'citation')),
  local_id integer not null,
  ddb_id   integer not null,
  primary key (kind, local_id)
) strict;
