-- The real repository and sources of the well, pulled before the indexing starts (`pull`). They
-- keep the ids of the well, so nothing needs mapping for them.
create table repository (
  id   integer primary key,
  type text not null,
  name text not null check (name <> ''),
  abbr text,
  url  text
) strict;

create table source (
  id          integer primary key,
  repo_id     integer references repository (id),
  type        text not null,
  period_from text,
  period_to   text,
  period_qual text check (period_qual is null or period_qual in ('exact', 'calculated', 'estimated', 'about')),
  title       text not null check (title <> ''),
  callno      text,
  url         text
) strict;

alter table event add column source_id integer references source (id);
