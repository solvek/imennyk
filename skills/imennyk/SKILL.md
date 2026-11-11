---
name: imennyk
description: Index people in archival documents (metric books, confession lists, revision tales) from scans into a bank — a local SQLite database of persons, events, ties, places and doubts — and review it. Also turns FamilySearch family trees into a bank without living people. Use for «індексувати справу», «прочитати скани», «метрична книга», «сповідний розпис», «ревізька казка», «банка», «банкувати», «Гортач», FamilySearch scans or trees.
license: Apache-2.0
---

# Іменник

Іменник готує дані для заливки в генеалогічну базу: агент читає скани архівної справи і пише все прочитане в **банку** — локальну базу SQLite справи (`case.sqlite`). Банку переглядає людина, а заливають її в базу (наприклад, у криницю Grapa) інструменти тієї бази.

`<скіл>` нижче — тека цього файла. Усі скрипти потребують лише Node.js 24 або новішого.

## Терміни
- **банка** — `case.sqlite` однієї архівної справи: скани, особи, події, зв'язки, атрибути, місця, сумніви, словник справи, прогони.
- **банкувати** — підготувати банку для задачі: отримати скани, прочитати, записати.
- **прогін** — одне читання в банці: одна модель, одна частина справи (парафія).
- **сумнів** — прочитане слово (ім'я, по батькові, прізвище, місце), у якому агент не певен; його переглядає людина.
- **Гортач** — локальний веб для перегляду банки: сумніви, вибірка, відсоток помилок.
- **криниця** — база Grapa, куди банки заливають; Іменник у неї не пише.

## Що прочитати
| Задача | Документ |
|---|---|
| прочитати скани справи в банку (головне) | [references/workflow.md](references/workflow.md) |
| тип документа: будова сторінки, колонки, пастки — **перед** читанням нового типу | [references/document-types/](references/document-types/README.md) |
| переглянути банку, виміряти помилки | [references/review.md](references/review.md) |
| скачати скани з FamilySearch | [references/familysearch-scans.md](references/familysearch-scans.md) |
| дерево FamilySearch у банку | [references/familysearch-tree.md](references/familysearch-tree.md) |
| скорочення метрик, по батькові | [references/dictionaries/](references/dictionaries/README.md) |

## Перед першим прогоном: хто індексує
Кожен прогін записує автора індексування — того, хто запускає Іменник. Він налаштований локально, один раз на людину (`~/.config/imennyk/operator.yaml`, або `$XDG_CONFIG_HOME/imennyk/`, або файл з `$IMENNYK_OPERATOR`).
1. `node <скіл>/scripts/indexing.mjs operator` — друкує автора; код виходу 3 — ще не налаштовано.
2. Не налаштовано — **спитати людину**, як її підписати: ім'я і, за бажанням, посилання чи пошту. Не вигадувати й не брати з git чи облікового запису.
3. Записати відповідь одним рядком Markdown: `node <скіл>/scripts/indexing.mjs operator --set "[Ім'я Прізвище](mailto:пошта)"` (або просто ім'я, або `[Ім'я](https://…)`).

`run-start` і `familysearch-tree.mjs ingest` без автора відмовляють з цим самим поясненням.

## Скрипти
| Скрипт | Що |
|---|---|
| `node <скіл>/scripts/indexing.mjs <команда> <тека справи> …` | банка: `operator`, `init`, `scans`, `run-start`, `hints`, `ingest`, `compact`, `sample`, `run-report`, `merge`, `dump` |
| `node <скіл>/scripts/gortach.mjs --root <корінь справ>` | Гортач |
| `node <скіл>/scripts/familysearch-tree.mjs <fetch\|ingest> <тека>` | дерево FamilySearch у банку |
| `node <скіл>/scripts/scan-crops/crops.mjs <скан.jpg> <тека>` | смуги розвороту з лінійкою; потрібен ImageMagick (`magick`) |
| `node <скіл>/scripts/familysearch-scan/*.mjs` | скани FamilySearch; потрібні Chrome на `127.0.0.1:9222` і ImageMagick |

Скрипт без аргументів друкує, як ним користуватися.

## Правила
- **Агент не пише SQL.** Читання скана — JSON (або компактна нотація сповідки), який перевіряє й пише `indexing.mjs ingest`. Помилку схеми виправляють у читанні, а не обходять.
- **Читати зі скана**, збільшеними фрагментами; нічого не домислювати; написання — як у документі.
- **Сумнів — лише про слово**, з варіантами; у полях імен — найімовірніший повний варіант, без `?` і `…`.
- **Словники — лише в банці справи.** Глобальних словників немає; підказки — `indexing.mjs hints`.
- **З дерев живих не пишемо.** Особа, про яку невідомо, чи вона жива, у банку не потрапляє й називається у звіті.
- **Банки й скани справжніх справ** містять імена людей: вони лежать у теці справ користувача, а не в публічних репозиторіях.
- **Автор у кожному прогоні.** Зразок файла автора — [assets/operator.sample.yaml](assets/operator.sample.yaml).
