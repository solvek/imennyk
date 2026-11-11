# Пропозиція: Іменник як скіл

## Why

Волонтери з AI Harness (Claude Code та інші) мають ставити Іменник з GitHub одною командою і читати справи своєю моделлю (`docs/overview.md`, «Користувачі», етап 3). Зараз для цього треба клонувати репозиторій, ставити pnpm і залежності, а документи для агента перемішані з документами для розробки та прив'язані до тек Grapa.

## What Changes

- Нова тека `skills/imennyk/` — усе, що потрібно скілу для роботи, і нічого для розробки:
  - `SKILL.md` — вхід: коли вмикатися, словник термінів, порядок роботи, команди;
  - `references/` — документи для агента: порядок читання (з `docs/scan-extraction.md`, без шляхів `import/…` Grapa), типи документів, Гортач, FamilySearch (скани й дерева);
  - `scripts/` — зібрані CLI `indexing.mjs`, `gortach.mjs`, `familysearch-tree.mjs` (лише Node 24, без `pnpm install`) з міграціями поруч, і перенесені як є помічники з `tools/` (потребують ImageMagick і Chrome);
  - `assets/operator.sample.yaml`.
- `.claude-plugin/plugin.json` і `.claude-plugin/marketplace.json`: репозиторій ставиться як плугін Claude Code (`/plugin marketplace add solvek/imennyk`); тека `skills/` підходить і для інших інсталяторів скілів з GitHub.
- Збірка скрипта скіла з `src/` (`pnpm build:skill`) і тест, що зібрані файли в репозиторії збігаються з кодом.
- **BREAKING** для тих, хто кличе інструменти з репозиторію: `docs/scan-extraction.md`, `docs/familysearch-*.md`, `docs/document-types/` переїжджають у `skills/imennyk/references/`; `tools/` — у `skills/imennyk/scripts/`. Команди `pnpm indexing`, `pnpm gortach`, `pnpm familysearch:tree` лишаються для розробки.
- **BREAKING:** глобальні словники `dictionaries/` прибираємо: словники `*-khvorostiv` (однієї парафії, з id криниці) видаляємо зовсім — словники ведуться в банці кожної справи (вимога «Словники справи» в `scan-indexing`). Загальні `words-registers.tsv` (скорочення метрик) і `patronymics.tsv` лишаються в скілі як довідка для читання, не як дані інструмента.
- **Автор індексування в кожному прогоні.** Підпис людини, що запускає Іменник, налаштовується локально один раз (`~/.config/imennyk/operator.yaml`); коли його немає, `run-start` відмовляє, агент питає людину й записує відповідь `indexing operator --set`. Нова колонка `run.operator` (міграція).
- `docs/` лишається для розробки: `overview.md` і новий `skill.md` (як збирається й випускається скіл).

## Capabilities

### New Capabilities
- `skill-package`: як Іменник поставляється агентам — тека скіла, що ставиться з GitHub і працює без збирання, та узгодженість зібраних скриптів з кодом.

### Modified Capabilities
- `scan-indexing`: нова вимога «Автор прогону» (вимога «Словники справи» вже забороняє глобальні словники, вона не змінюється).

## Impact

- Нові: `skills/imennyk/**`, `.claude-plugin/*`, `src/skill/` (збірка), `docs/skill.md`, тест збірки.
- Переносяться: `docs/scan-extraction.md`, `docs/familysearch-*.md`, `docs/document-types/`, `tools/`, `operator.sample.yaml`; видаляються `dictionaries/*-khvorostiv*` і `dictionaries/README.md`.
- Змінюються: `src/indexing/cli.ts` (версія порядку читання — з нового місця документа), посилання на документи в коді й специфікаціях, `README.md`, `AGENTS.md`, `docs/overview.md`, ESLint/Prettier ignore.
- Нова міграція `0016_run_operator.sql`, нова команда `indexing operator`; `run-start` і `familysearch-tree ingest` потребують автора.
- Нова dev-залежність: `esbuild`.

## Поза межами

- MCP-сервер, переписування `tools/` на TypeScript і `sharp` — етап 3, окремими змінами.
- Підтягування незрозумілих значень (імена, прізвища, місця) з Предка — окрема зміна (етап 8).
- Публікація в npm і версіювання випусків понад `version` у `plugin.json`.
- Кілька скілів (наприклад, окремий для дерев FamilySearch).

## Відкриті питання власнику

1. Словники `*-khvorostiv` видалено за рішенням власника: словники ведуться в банці кожної справи, незрозумілі значення згодом підтягуватимуться з Предка. Чи лишати в скілі `words-registers.tsv` і `patronymics.tsv` як довідку для читання, чи теж видалити (тоді й вони — лише в банці справи чи з Предка)? Поки — лишаємо.
2. Власник маркетплейса в `marketplace.json`: пишемо `solvek` (як у посиланнях на GitHub), без пошти.
3. Зібрані скрипти комітимо в репозиторій (а не публікуємо пакет у npm) — так скіл ставиться прямо з GitHub.
