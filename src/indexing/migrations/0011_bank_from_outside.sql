-- The bank is filled from outside: its repositories and sources have ids of the bank, not of the
-- well, and the entry links them to rows of the well or adds them (ddb_map keeps which). A bank may
-- hold many sources, so a scan says whose file it is; ingest fills it from the source of a reading.
alter table scan add column source_id integer references source (id);

update scan set source_id = (
  select min(e.source_id) from event e where e.scan_id = scan.id and e.source_id is not null
  having count(distinct e.source_id) = 1
);

create table ddb_map_new (
  kind     text not null check (kind in ('person', 'event', 'tie', 'place', 'citation', 'source', 'repository')),
  local_id integer not null,
  ddb_id   integer not null,
  primary key (kind, local_id)
) strict;

insert into ddb_map_new (kind, local_id, ddb_id) select kind, local_id, ddb_id from ddb_map;
drop table ddb_map;
alter table ddb_map_new rename to ddb_map;
