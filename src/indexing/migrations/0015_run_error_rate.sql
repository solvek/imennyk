-- The result of checking the sample of a run (its error rate) lived in `run-<datetime>.yaml`
-- next to the bank; it is kept in the bank now, with the rest of the run. The counters of the
-- old metafile (scans processed, doubts) are counted from the rows when they are needed.
alter table run add column sample_size integer check (sample_size >= 0);
alter table run add column sample_errors integer check (sample_errors >= 0);
alter table run add column wer real check (wer between 0 and 100);
