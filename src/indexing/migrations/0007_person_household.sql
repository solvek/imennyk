-- The household (confession event) a person was read in: a member without a tie to anyone is
-- still part of the household. Filled by `ingest`; older databases are filled by `households`.
alter table person add column event_id integer references event (id);
create index person_event on person (event_id);
