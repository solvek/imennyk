-- A doubt is only about a word that was read: a given name, a patronymic, a surname or the name of
-- a place. Doubts about ties, ages, genders and anything else go; ties added in review stay in
-- `tie`. The table is rebuilt because sqlite cannot change a CHECK in place.
delete from doubt where element not in ('surname', 'given', 'patronymic', 'place');

create table doubt_word (
  id          integer primary key,
  run_id      integer not null references run (id),
  scan_id     integer not null references scan (id),
  box_id      integer references box (id),
  element     text not null check (element in ('surname', 'given', 'patronymic', 'place')),
  person_id   integer references person (id),
  place_id    integer references place (id),
  read_text   text,
  variants    text,
  unreadable  integer not null default 0 check (unreadable in (0, 1)),
  note        text,
  resolution  text,
  status      text not null default 'open' check (status in ('open', 'confirmed', 'fixed', 'unknown')),
  check (unreadable = 0 or read_text is not null)
) strict;

insert into doubt_word (id, run_id, scan_id, box_id, element, person_id, place_id, read_text,
                        variants, unreadable, note, resolution, status)
select id, run_id, scan_id, box_id, element, person_id, place_id, read_text,
       variants, unreadable, note, resolution, status
  from doubt;

drop table doubt;
alter table doubt_word rename to doubt;
