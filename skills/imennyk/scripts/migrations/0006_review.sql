-- Review of a case by a human (Gortach): a state and a reviewer's note on doubts and on places of
-- the sample, the agent's reading of a sampled place, and the name rule in the database.

-- States: open; confirmed (correct); fixed (value corrected); unknown (unreadable / do not know).
-- A doubt about a tie has two more: a tie was added or deleted. A sample place has the first four.
alter table doubt add column status text not null default 'open'
  check (status in ('open', 'confirmed', 'fixed', 'unknown', 'tie_added', 'tie_deleted'));

alter table sample add column status text not null default 'open'
  check (status in ('open', 'confirmed', 'fixed', 'unknown'));
alter table sample add column note text;
-- The surname as the agent read it, taken at the first review; never changed afterwards.
alter table sample add column read_text text
  check (status = 'open' or read_text is not null);

create trigger sample_read_text_kept before update of read_text on sample
  when old.read_text is not null and new.read_text is not old.read_text
begin
  select raise(abort, 'the reading of a sample place does not change');
end;

-- A name part is a full variant: not empty, no sign of doubt (that is what a doubt is for).
-- Rows that exist are not checked; every new or changed value is.
create trigger person_name_insert before insert on person
begin
  select raise(abort, 'a name must be a full variant without «?» or «…»')
   where new.given = '' or instr(new.given, '?') > 0 or instr(new.given, '…') > 0 or instr(new.given, '...') > 0
      or new.patronymic = '' or instr(new.patronymic, '?') > 0 or instr(new.patronymic, '…') > 0 or instr(new.patronymic, '...') > 0
      or new.surname = '' or instr(new.surname, '?') > 0 or instr(new.surname, '…') > 0 or instr(new.surname, '...') > 0;
end;

create trigger person_name_update before update of given, patronymic, surname on person
begin
  select raise(abort, 'a name must be a full variant without «?» or «…»')
   where new.given = '' or instr(new.given, '?') > 0 or instr(new.given, '…') > 0 or instr(new.given, '...') > 0
      or new.patronymic = '' or instr(new.patronymic, '?') > 0 or instr(new.patronymic, '…') > 0 or instr(new.patronymic, '...') > 0
      or new.surname = '' or instr(new.surname, '?') > 0 or instr(new.surname, '…') > 0 or instr(new.surname, '...') > 0;
end;

create trigger name_mention_text_insert before insert on name_mention
begin
  select raise(abort, 'a name must be a full variant without «?» or «…»')
   where instr(new.text, '?') > 0 or instr(new.text, '…') > 0 or instr(new.text, '...') > 0;
end;

create trigger name_mention_text_update before update of text on name_mention
begin
  select raise(abort, 'a name must be a full variant without «?» or «…»')
   where instr(new.text, '?') > 0 or instr(new.text, '…') > 0 or instr(new.text, '...') > 0;
end;
