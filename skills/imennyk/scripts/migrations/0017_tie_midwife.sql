-- The well got the tie type `midwife` (the «Obstetrix» of a birth record after 1833); the CHECK
-- list of `tie` follows, so that a bank accepts exactly the types of the well.
create table tie_new (
  id        integer primary key,
  run_id    integer not null references run (id),
  scan_id   integer not null references scan (id),
  box_id    integer references box (id),
  line_id   integer references text_line (id),
  person_id integer not null references person (id),
  other_id  integer not null references person (id),
  type      text not null check (type in ('child', 'spouse', 'godparent', 'friend', 'witness', 'officiant', 'midwife', 'informant', 'mentioned', 'kin', 'relative')),
  relation  text,
  up        integer,
  down      integer,
  event_id  integer references event (id),
  check (person_id <> other_id)
) strict;
insert into tie_new (id, run_id, scan_id, box_id, line_id, person_id, other_id, type, relation, up, down, event_id)
  select id, run_id, scan_id, box_id, line_id, person_id, other_id, type, relation, up, down, event_id from tie;
drop table tie;
alter table tie_new rename to tie;
