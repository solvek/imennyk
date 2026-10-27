# Design

## Context

Код живе в Grapa (`solvek/grapa`, гілка `main`). Ядро індексації залежить лише від `node:sqlite`, `zod` і `yaml`; PostgreSQL потрібен тільки `pull`, `enter/` і частинам дерев FamilySearch, що зіставляють місця з базою й вносять у неї. Зв'язки, які треба розірвати:
- `src/genealogy/indexing/enums.ts` перевіряє переліки через `satisfies` з типами `src/generated/db.ts` (згенеровані з бази Grapa);
- `reading.ts` бере перелік атрибутів з `src/genealogy/attribute-types.ts`;
- Гортач бере `esc` і `page` з `src/web/html.ts`;
- `src/genealogy/import/familysearch-tree/cli.ts` змішує `fetch`/`ingest` (банка) з `enter`/`places` (база);
- `test/genealogy/indexing/db.test.ts` змішує тести банки з тестами `pull` на PostgreSQL.

## Goals / Non-Goals

**Goals:**
- Історія комітів перенесених файлів доступна в Іменнику (`git log --follow`).
- Після переїзду `pnpm typecheck`, `pnpm lint`, `pnpm test` в Іменнику зелені без PostgreSQL і без мережі.
- Поведінка CLI `indexing`, `gortach`, `familysearch:tree fetch|ingest` та сама, що в Grapa.

**Non-Goals:**
- Рефакторинг, перейменування функцій, нові можливості.
- Зміни в Grapa (окрема зміна, етап 2).

## Decisions

### Історія через `git filter-repo` на окремому клоні
Свіжий клон Grapa у `/var/tmp`, `git filter-repo` з переліком `--path` (лише файли, що переходять, і їхні колишні шляхи для історії перейменувань) і `--path-rename` у нову розкладку; потім `git pull --allow-unrelated-histories` з цього клону в Іменник. Альтернатива — копіювати файли без історії: простіше, але губить пояснення в комітах, чому зроблено саме так.

Файли, які лише частково переходять (`familysearch-tree/cli.ts`, `indexing/db.test.ts`), переходять з історією цілими, а зайве прибирається окремим комітом в Іменнику.

### Розкладка
| Grapa | Іменник |
|---|---|
| `src/genealogy/indexing/` (без `pull.ts`, `pull-cli.ts`, `enter/`) | `src/indexing/` |
| `src/genealogy/attribute-types.ts` | `src/indexing/attribute-types.ts` |
| `src/web/gortach/`, `src/web/html.ts` | `src/gortach/`, `src/gortach/html.ts` |
| `src/genealogy/import/familysearch-tree/` (без `enter.ts`, `places.ts`) | `src/familysearch/tree/` |
| `src/genealogy/import/living.ts` | `src/living.ts` |
| `import/familysearch-dgs/scan.mjs`, `group.mjs` | `tools/familysearch-scan/` |
| `import/dictionaries/` | `dictionaries/` |
| `test/genealogy/indexing/` (без `enter*.test.ts`), `test/web/gortach*.test.ts`, `test/genealogy/familysearch-tree/` (без `enter.test.ts`), `test/genealogy/living.test.ts` | `test/indexing/`, `test/gortach/`, `test/familysearch/tree/`, `test/living.test.ts` |
| `docs/genealogy/indexing/scan-extraction.md`, `familysearch-browser.md`, `familysearch-tree.md` | `docs/` |

Плоска розкладка замість `genealogy/…`: в Іменнику немає поділу ядро/домен, увесь проєкт — про людей у документах.

### Власний словник типів
`enums.ts` втрачає імпорт `src/generated/db.ts`: типи виводяться з самих масивів (`(typeof EVENT_TYPES)[number]`). Значення лишаються ті самі; збіг з базою Grapa перевіряє Grapa у своїй зміні етапу 2. `attribute-types.ts` переходить як є, разом з id типів атрибутів Grapa: вони потрібні заливці.

### `html.ts` — копія для Гортача
`esc` і `page` потрібні й сайту Grapa, тож у Grapa файл лишається; в Іменнику він стає частиною Гортача. Стиль «як сайт Grapa» зберігається.

### `tools/` поза ESLint до етапу 3
`scan.mjs` і `group.mjs` — скрипти, що керують Chrome на хості через CDP; правил `strict-type-checked` вони не пройдуть. `tools/` додається в `ignores` ESLint з коментарем-посиланням на етап 3 (відкрите питання 1 у proposal).

### Копія в Grapa заморожується
До етапу 2 у Grapa лишається своя копія коду, бо нею користується заливка. Правки індексації після переїзду робляться лише в Іменнику (відкрите питання 2 у proposal).

## Risks / Trade-offs

- [Код у двох місцях розійдеться] → копія в Grapa заморожена; етап 2 — наступний після цього.
- [`filter-repo` загубить історію перейменованих файлів] → у `--path` додаються і старі шляхи (`git log --follow --name-only` перед фільтром показує їх).
- [Тести, що потай залежать від PostgreSQL чи файлів Grapa] → кожен перенесений тест проганяється в Іменнику; тест на PostgreSQL лишається в Grapa.
- [Персональні дані з історії Grapa] → фільтр бере лише код, тести на вигаданих даних, документи й словники слів; банки, трекери справ і `import/indexing/` не переносяться. Після фільтра — пошук по всій історії Іменника імен з трекерів справ.

## Migration Plan

1. Переїзд в Іменник цією зміною; Grapa не змінюється.
2. Етап 2: Іменник як пакет, Grapa підключає його і видаляє свою копію (зміна в Grapa).
Відкат — видалити злиту історію в Іменнику (`git reset` до коміту заготовки); Grapa не зачеплена.
