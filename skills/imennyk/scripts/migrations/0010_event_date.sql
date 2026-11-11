-- The date of an event as the well keeps it: first and last day and how it is known. Records of a
-- tree (FamilySearch, GEDCOM …) carry full dates; `year` stays for events known by the year of
-- the document (confession).
alter table event add column date_from text
  check (date_from is null or date_from glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]');
alter table event add column date_to text
  check (date_to is null or date_to glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]');
alter table event add column date_qual text
  check (date_qual is null or date_qual in ('exact', 'calculated', 'estimated', 'about'));
