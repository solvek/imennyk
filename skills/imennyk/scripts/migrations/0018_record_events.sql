-- Records of a register (births, marriages, deaths …) are events with a date, not households:
-- an event may carry the date of the act (the baptism of a birth, the burial of a death) and a
-- person may carry the place she or he is from (the village of a groom is not that of the bride).
alter table event add column reg_date text
  check (reg_date is null or reg_date glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]');
alter table person add column place_id integer references place (id);
create index person_place on person (place_id);
