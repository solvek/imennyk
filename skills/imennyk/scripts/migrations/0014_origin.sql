-- The well got the attribute type `origin` (openspec change credits); the CHECK list of
-- `attribute` follows, so that a bank accepts exactly the types of the well.
create table attribute_new (
  id        integer primary key,
  run_id    integer not null references run (id),
  scan_id   integer not null references scan (id),
  box_id    integer references box (id),
  type      text not null check (type in ('religion', 'status', 'occupation', 'cause', 'author', 'pubinfo', 'address', 'note', 'url', 'parts', 'scan', 'research', 'yaml', 'nationality', 'nick', 'y_haplogroup', 'index', 'marital', 'serial', 'ext_id', 'origin')),
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
