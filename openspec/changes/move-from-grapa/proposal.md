# Proposal

## Why

Індексація людей уже працює в Grapa: банка справи (`case.sqlite`), читання сканів агентом зі схемою JSON, вибірка й відсоток помилок, Гортач, читання дерев FamilySearch у банку. Щоб нею могли користуватися інші, її виносимо у відкритий проєкт Іменник (рішення власника 2026-10-27, `docs/ideas/imennyk.md` у Grapa). Перший крок — просто перенести те, що є, без змін поведінки; нове додаємо наступними змінами (`docs/overview.md`, етапи).

## What Changes

- Код переноситься з Grapa **з історією комітів** (`git filter-repo`), у нову розкладку Іменника:
  - ядро індексації (`src/genealogy/indexing/` без `pull*` і `enter/`) → `src/indexing/`: банка й міграції, схема читання, `ingest`, `hints`, `sample`, `review`, `run`, `dump`, `scans`, двори, сирі скани; CLI `pnpm indexing`;
  - Гортач (`src/web/gortach/` і потрібний йому `src/web/html.ts`) → `src/gortach/`; CLI `pnpm gortach`;
  - читання дерев FamilySearch у банку (`api`, `browser`, `crawl`, `parse`, `model`, `ingest` з `src/genealogy/import/familysearch-tree/`) і правило живих (`src/genealogy/import/living.ts`) → `src/familysearch/tree/`, `src/living.ts`; CLI `pnpm familysearch:tree` лише з командами `fetch` і `ingest`;
  - перелік типів атрибутів (`src/genealogy/attribute-types.ts`) → `src/indexing/attribute-types.ts`;
  - завантаження сканів FamilySearch (`import/familysearch-dgs/scan.mjs`, `group.mjs`) — як є, у `tools/familysearch-scan/`;
  - словники слів без людей (`import/dictionaries/`) → `dictionaries/`;
  - тести цих модулів, що не потребують PostgreSQL.
- Залежність від згенерованих типів бази Grapa (`src/generated/db.ts` в `enums.ts`) прибирається: перелік типів подій, зв'язків, статей, місць і `date_qual` банки стає власним, з тими самими значеннями.
- Документи переносяться й правляться під Іменник: `scan-extraction.md` (без розділів про внесення в базу), `familysearch-browser.md`, `familysearch-tree.md` (без розділів про внесення).
- Специфікації `scan-indexing` і `scan-review` переходять з Grapa з мінімальними правками (шляхи, назва бази призначення); для читання дерев у банку — нова специфікація наявної поведінки.

Поза межами зміни:
- Будь-які зміни поведінки: версія схеми банки, публічний API для заливки, плугін, MCP, `sharp`, сегментатор, каталог бланків, CSV, веб — наступні етапи.
- Заливка банки в базу (`enter`), копіювання сховища й джерела з бази (`pull`), зіставлення місць дерев з базою (`places`) — лишаються в Grapa.
- Зміни в самій Grapa: її копія коду не видаляється в цій зміні; перехід Grapa на пакет Іменника — окрема зміна в Grapa (етап 2).
- Переписування `scan.mjs` на TypeScript (етап 3).
- Імпорт РАГЗ і record-sheet.

## Рішення власника (2026-10-27)

1. Межа: Іменник — усе до банки, Grapa — від банки до бази.
2. Спершу просто перенести наявне, нове — поетапно.
3. Завантаження сканів FamilySearch переносимо як є, переписуємо пізніше.
4. Мова — TypeScript; документація — українською; ліцензія — Apache 2.0.

## Відкриті питання до власника

1. **`scan.mjs` поза лінтером.** Скрипт як є не пройде `strict-type-checked`; пропонуємо виключити `tools/` з ESLint до етапу 3 (з коментарем у конфігу). Інакше — переписати одразу.
2. **Дві копії коду до етапу 2.** Поки Grapa не підключила пакет, її копія індексації заморожується: правки індексації робимо лише в Іменнику, а Grapa лише користується своєю копією для заливки. Чи підходить?
3. **Словники Хворостова** (`*-khvorostiv.tsv`) — слова однієї парафії. Переносимо всі як приклад підказок чи лише загальні (`patronymics.tsv`, `words-registers.tsv`)?

## Capabilities

### New Capabilities
- `scan-indexing`: банка однієї справи: скани, рядки, бокси, особи, двори, зв'язки, атрибути, сумніви, словники справи, вибірка, прогони; читання JSON зі схемою. Переходить з Grapa.
- `scan-review`: перегляд банки в Гортачі: сумніви, вибірка прізвищ, виправлення, відсоток помилок прогону. Переходить з Grapa.
- `familysearch-tree-bank`: читання предків з дерева FamilySearch у банку з правилом живих.

### Modified Capabilities
Немає.

## Impact

- Репозиторій Іменника: `src/`, `test/`, `docs/`, `dictionaries/`, `tools/`, `package.json` (залежності `zod`, `yaml`; скрипти `indexing`, `gortach`, `familysearch:tree`).
- Grapa: без змін у цій зміні.
- Потрібен Node.js з `node:sqlite` (Node 24, як у Grapa).
