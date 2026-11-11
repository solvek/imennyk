# skill-package Specification

## Purpose
Як Іменник поставляється агентам ШІ: тека скіла, яку ставлять з GitHub і яка працює без збирання, з документами для агента й скриптами, узгодженими з кодом репозиторію.

## Requirements

### Requirement: Тека скіла
Репозиторій MUST мати теку `skills/imennyk/` з `SKILL.md`, у шапці якого є `name: imennyk` і `description`. Усе, на що посилається `SKILL.md` (документи, скрипти, зразки), MUST лежати в цій теці.

#### Scenario: Посилання не виходять за теку
- **WHEN** `SKILL.md` чи документ у `references/` посилається на відносний шлях
- **THEN** цей шлях веде до наявного файла всередині `skills/imennyk/`

### Requirement: Плугін Claude Code
Репозиторій MUST мати `.claude-plugin/plugin.json` і `.claude-plugin/marketplace.json`, щоб його можна було додати як маркетплейс і поставити плугін `imennyk`, що містить скіл.

#### Scenario: Маркетплейс з одним плугіном
- **WHEN** читають `.claude-plugin/marketplace.json`
- **THEN** у ньому плугін `imennyk` з джерелом — корінь репозиторію, а `plugin.json` має ту саму назву

### Requirement: Скрипти без збирання
Скрипти скіла MUST запускатися Node.js 24 без встановлення залежностей і без TypeScript: `indexing.mjs`, `gortach.mjs`, `familysearch-tree.mjs` у `skills/imennyk/scripts/`, з міграціями банки поруч.

#### Scenario: Нова справа зі скіла
- **WHEN** у тимчасовій теці без `node_modules` виконати `node skills/imennyk/scripts/indexing.mjs init <тека справи>`
- **THEN** у теці справи з'являється `case.sqlite` з останньою версією схеми

### Requirement: Зібрані скрипти збігаються з кодом
Зібрані скрипти в `skills/imennyk/scripts/` MUST бути тим, що дає збірка з поточного `src/`; перевірка (`pnpm test`) MUST падати, коли вони розійшлися.

#### Scenario: Код змінено, скрипт не перезібрано
- **WHEN** у `src/indexing/` змінено код, а `pnpm build:skill` не запущено
- **THEN** `pnpm test` падає й називає файл скіла, що застарів

### Requirement: Скіл без персональних даних і без даних однієї справи
Тека скіла MUST NOT містити банок, сканів і словників, прив'язаних до однієї парафії чи справи; словники справи живуть у її банці.

#### Scenario: Пошук словників парафії
- **WHEN** перелічити файли `skills/imennyk/`
- **THEN** немає файлів `*.sqlite`, зображень сканів і словників з назвою парафії чи справи
