-- The key of the household in the reading JSON, so that a household written over a page break
-- can be continued by the reading of the next scan.
alter table event add column key text;
create index event_scan_key on event (scan_id, key);
