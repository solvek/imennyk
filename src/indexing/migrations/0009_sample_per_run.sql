-- The sample belongs to a run: every run of a case has its own sample, ranked from 1.
-- The table is rebuilt because SQLite can neither add a not-null foreign key column nor drop
-- `unique (rank)`. Rows that exist are copied as they are (id, rank, state, note, the reading of
-- the agent); only `run_id` is new and comes from the surname mention the place points to.

-- A sample place and its mention must belong to the same run: the database holds the rule.
create unique index name_mention_id_run on name_mention (id, run_id);

create table sample_per_run (
  id              integer primary key,
  run_id          integer not null references run (id),
  name_mention_id integer not null unique,
  rank            integer not null,
  status          text not null default 'open'
    check (status in ('open', 'confirmed', 'fixed', 'unknown')),
  note            text,
  -- The surname as the agent read it, taken at the first review; never changed afterwards.
  read_text       text check (status = 'open' or read_text is not null),
  unique (run_id, rank),
  foreign key (name_mention_id, run_id) references name_mention (id, run_id)
) strict;

insert into sample_per_run (id, run_id, name_mention_id, rank, status, note, read_text)
select sm.id, m.run_id, sm.name_mention_id, sm.rank, sm.status, sm.note, sm.read_text
  from sample sm
  join name_mention m on m.id = sm.name_mention_id
 order by sm.id;

drop table sample;
alter table sample_per_run rename to sample;

create trigger sample_read_text_kept before update of read_text on sample
  when old.read_text is not null and new.read_text is not old.read_text
begin
  select raise(abort, 'the reading of a sample place does not change');
end;
