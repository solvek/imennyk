# Скіл Іменника: будова, збирання, встановлення

Іменник поставляється агентам як скіл `skills/imennyk/`: тека, яку інсталятор скілів бере з GitHub як є і яка працює лише з Node.js 24, без `pnpm install` і без TypeScript. Усе, що потрібно для розробки, лишається поза нею.

## Що де
| Де | Для кого | Що |
|---|---|---|
| `skills/imennyk/SKILL.md` | агент | вхід скіла: терміни, автор індексування, що читати, скрипти, правила |
| `skills/imennyk/references/` | агент | порядок читання (`workflow.md`), типи документів, Гортач, FamilySearch, довідка для читання |
| `skills/imennyk/scripts/*.mjs`, `migrations/` | агент | **зібрані** з `src/` CLI (`indexing`, `gortach`, `familysearch-tree`) і спільні chunk-и; міграції банки поруч |
| `skills/imennyk/scripts/familysearch-scan/`, `scan-crops/` | агент | помічники, перенесені з Grapa як є (Chrome по CDP, ImageMagick); переписуються на етапі 3 |
| `skills/imennyk/assets/` | людина | зразок `operator.yaml` |
| `.claude-plugin/` | Claude Code | `plugin.json` і `marketplace.json`: репозиторій — маркетплейс з одним плугіном `imennyk` |
| `src/`, `test/`, `openspec/`, `docs/` | розробник | код, тести, специфікації, мета й етапи |

## Збирання
```bash
pnpm build:skill
```
`src/skill/build.ts` збирає esbuild-ом три CLI в ES-модулі з `zod` і `yaml` усередині (спільне — у `chunk-*.mjs`) і копіює міграції. Без мінімізації й часу збирання, тож той самий код дає той самий текст. Зібрані файли комітимо разом зі зміною в `src/`: `pnpm test` падає, коли вони розійшлися з кодом, і називає застарілий файл.

## Автор індексування
Кожен прогін пише в банку автора (`run.operator`): рядок Markdown з `operator.yaml` людини, що запускає Іменник. Файл локальний, поза справами: `$IMENNYK_OPERATOR`, інакше `$XDG_CONFIG_HOME/imennyk/operator.yaml`, інакше `~/.config/imennyk/operator.yaml`. Коли його немає, `run-start` і `familysearch-tree ingest` відмовляють з поясненням, а агент питає людину й пише відповідь `indexing operator --set "<підпис>"`. Правила — `src/credits/operator.ts`.

## Встановлення
Claude Code:
```
/plugin marketplace add solvek/imennyk
/plugin install imennyk@imennyk
```
Інші агенти, що ставлять скіли з GitHub, беруть теку `skills/imennyk/` (наприклад, `npx skills add solvek/imennyk`). Можна й скопіювати її в теку скілів агента (`~/.claude/skills/imennyk/`).

## Версії
Версія — `version` у `.claude-plugin/plugin.json`; її піднімають, коли змінюється поведінка скіла чи схема банки.
