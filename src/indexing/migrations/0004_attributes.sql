-- Notes and other facts without a column are attributes, as in the well: type (code of the
-- attribute types of the well), value and one owner. Owners are the rows of this case; at the
-- entry into the well they become attributes of the same owners (the scan owner is the citation).
alter table person drop column note;
alter table event drop column note;
alter table scan drop column note;

create table attribute (
  id        integer primary key,
  run_id    integer not null references run (id),
  scan_id   integer not null references scan (id),
  box_id    integer references box (id),
  type      text not null check (type in ('religion', 'status', 'occupation', 'cause', 'author', 'pubinfo', 'address', 'note', 'url', 'parts', 'scan', 'research', 'yaml', 'nationality', 'nick', 'y_haplogroup', 'index', 'marital', 'serial')),
  person_id integer references person (id),
  event_id  integer references event (id),
  tie_id    integer references tie (id),
  place_id  integer references place (id),
  on_scan   integer not null default 0 check (on_scan in (0, 1)),
  value     text not null check (value <> ''),
  check ((person_id is not null) + (event_id is not null) + (tie_id is not null) + (place_id is not null) + on_scan = 1)
) strict;

create index attribute_person on attribute (person_id) where person_id is not null;
create index attribute_event on attribute (event_id) where event_id is not null;
