-- The well got the place type `colony` and the attribute type `ext_id` (openspec change
-- gazetteer); the CHECK lists of `place` and `attribute` follow. Other tables point at `place`,
-- so the foreign-key check waits for the end of the migration's transaction.
pragma defer_foreign_keys = on;

create table place_new (
  id      integer primary key,
  run_id  integer not null references run (id),
  scan_id integer not null references scan (id),
  box_id  integer references box (id),
  line_id integer references text_line (id),
  name    text not null check (name <> ''),
  type    text check (type is null or type in ('country', 'region', 'district', 'volost', 'parish', 'settlement', 'colony', 'hamlet', 'church', 'cemetery', 'street', 'building'))
) strict;
insert into place_new (id, run_id, scan_id, box_id, line_id, name, type)
  select id, run_id, scan_id, box_id, line_id, name, type from place;
drop table place;
alter table place_new rename to place;

create table attribute_new (
  id        integer primary key,
  run_id    integer not null references run (id),
  scan_id   integer not null references scan (id),
  box_id    integer references box (id),
  type      text not null check (type in ('religion', 'status', 'occupation', 'cause', 'author', 'pubinfo', 'address', 'note', 'url', 'parts', 'scan', 'research', 'yaml', 'nationality', 'nick', 'y_haplogroup', 'index', 'marital', 'serial', 'ext_id')),
  person_id integer references person (id),
  event_id  integer references event (id),
  tie_id    integer references tie (id),
  place_id  integer references place (id),
  on_scan   integer not null default 0 check (on_scan in (0, 1)),
  value     text not null check (value <> ''),
  check ((person_id is not null) + (event_id is not null) + (tie_id is not null) + (place_id is not null) + on_scan = 1)
) strict;
insert into attribute_new (id, run_id, scan_id, box_id, type, person_id, event_id, tie_id, place_id, on_scan, value)
  select id, run_id, scan_id, box_id, type, person_id, event_id, tie_id, place_id, on_scan, value from attribute;
drop table attribute;
alter table attribute_new rename to attribute;
create index attribute_person on attribute (person_id) where person_id is not null;
create index attribute_event on attribute (event_id) where event_id is not null;
