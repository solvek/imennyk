# Завдання

## 1. Банка й читання

- [x] 1.1 Міграція `0018_record_events.sql`: `event.reg_date`, `person.place_id`; перевірка: `pnpm test` (тест версії схеми)
- [x] 1.2 `events[]` у `reading.ts` (подія, дата, `reg_date`, `place`, члени з `main` і `place`); перевірка: тест схеми
- [x] 1.3 `ingest.ts`: один код для двору й запису, дата події, вік від її року, місце особи, перевірка сумнівів по всіх людях; перевірка: `test/indexing/ingest.test.ts`

## 2. Документація й скіл

- [x] 2.1 `references/document-types/metric-books-latin.md`, рядок у `README.md`, абзац у `metric-books.md` і `workflow.md`; перевірка: тест посилань скіла
- [x] 2.2 `docs/overview.md`: записи реєстру в етапах; перевірка: прочитати
- [x] 2.3 `pnpm build:skill`; перевірка: тест свіжості скриптів

## 3. Перевірка

- [x] 3.1 `pnpm typecheck`, `pnpm lint`, `pnpm test`
