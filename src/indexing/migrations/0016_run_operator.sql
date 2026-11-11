-- Who ran the indexing: the credit line of the operator (a name, a link or a mailto: link), from
-- the local operator.yaml of the person who runs Imennyk. Runs made before have none.
alter table run add column operator text check (operator is null or trim(operator) <> '');
