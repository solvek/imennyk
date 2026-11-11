# Завдання

## 1. Збирання скриптів скіла

- [x] 1.1 Додати `esbuild` у devDependencies і скрипт `build:skill`; перевірка: `pnpm install` проходить
- [x] 1.2 `src/skill/build.ts` (файли скриптів, chunk-ів і міграцій без запису) і `src/skill/cli.ts`; перевірка: `pnpm build:skill` пише `skills/imennyk/scripts/{indexing,gortach,familysearch-tree}.mjs` і `migrations/`
- [x] 1.3 Версія порядку читання з `skills/imennyk/references/workflow.md` у `src/indexing/cli.ts`; перевірка: `pnpm typecheck`
- [x] 1.4 Тест свіжості зібраних файлів і тест, що `node skills/imennyk/scripts/indexing.mjs init` у тимчасовій теці дає `case.sqlite` з останньою версією схеми; перевірка: `pnpm test`
- [x] 1.5 ESLint і Prettier ignore: `skills/imennyk/scripts/` замість `tools/`; перевірка: `pnpm lint`

## 2. Автор індексування

- [x] 2.1 Міграція `0016_run_operator.sql`, `operator` у `startRun` і `runSummary`; перевірка: `test/indexing/run.test.ts`
- [x] 2.2 Шлях, формат і повідомлення в `src/credits/operator.ts`, читання й запис у `src/credits/local.ts`; перевірка: `test/credits/operator.test.ts`
- [x] 2.3 `indexing operator [--set]`, автор обов'язковий у `run-start` і `familysearch-tree ingest`; перевірка: тест скрипта скіла «не налаштовано → записати → прогін з автором»

## 3. Тека скіла

- [x] 3.1 Перенести `tools/` у `skills/imennyk/scripts/` (`scan-crops/`, `familysearch-scan/`, без шляхів машини власника) і `operator.sample.yaml` у `skills/imennyk/assets/`; перевірка: `git grep "tools/"` не знаходить старих шляхів
- [x] 3.2 Перенести `docs/document-types/`, `docs/familysearch-browser.md` (→ `familysearch-scans.md`), `docs/familysearch-tree.md` у `skills/imennyk/references/`; команди — через `node <скіл>/scripts/…`; перевірка: тест посилань
- [x] 3.3 Переписати `docs/scan-extraction.md` у `references/workflow.md` (лише банка, без шляхів `import/…` Grapa і без глобальних словників); Гортач — у `references/review.md`; перевірка: тест посилань
- [x] 3.4 Видалити `dictionaries/*-khvorostiv*` і `dictionaries/README.md`; `words-registers.tsv`, `patronymics.tsv` — у `references/dictionaries/` з README; перевірка: тест вмісту теки скіла
- [x] 3.5 `SKILL.md` (назва, опис з українськими словами-тригерами, терміни, автор перед першим прогоном, що читати, скрипти, правила); перевірка: тест шапки й посилань
- [x] 3.6 `.claude-plugin/plugin.json` і `marketplace.json`; перевірка: тест маніфестів

## 4. Документи розробки

- [x] 4.1 `docs/skill.md`: будова скіла, збирання, автор, встановлення; перевірка: `pnpm build:skill` виконується як написано
- [x] 4.2 `docs/overview.md`: етап 3 частково зроблено; Предок — етап 8; перевірка: посилання ведуть до наявних файлів
- [x] 4.3 `README.md`, `AGENTS.md`, посилання в `openspec/specs/` і коментарях коду на нові шляхи; перевірка: `git grep` старих шляхів поза архівом порожній

## 5. Перевірка

- [x] 5.1 `pnpm typecheck`, `pnpm lint`, `pnpm test` проходять
