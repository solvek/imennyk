# Іменник

Відкритий репозиторій підготовки даних для заливки в криницю (базу [Grapa](https://github.com/solvek/grapa)), насамперед витягування людей з архівних документів: на вході скани справи, на виході **банка** — локальна база SQLite з особами, подіями, зв'язками, місцями й сумнівами.

Код перенесено з Grapa разом з історією. Мета, межі й етапи — [docs/overview.md](docs/overview.md); будова скіла — [docs/skill.md](docs/skill.md); порядок читання сканів — [skills/imennyk/references/workflow.md](skills/imennyk/references/workflow.md).

## Встановлення скіла
Іменник ставиться як скіл агента (Claude Code та інші); потрібен лише Node.js 24.

```
/plugin marketplace add solvek/imennyk
/plugin install imennyk@imennyk
```

Інші агенти беруть теку [`skills/imennyk/`](skills/imennyk/SKILL.md) з GitHub. Перед першим прогоном агент спитає, як підписати автора індексування, і запише це локально.

## Розробка
Потрібні Node.js 24 і pnpm.

```bash
pnpm install
pnpm indexing init <тека справи>        # банка справи; інші команди — skills/imennyk/references/workflow.md
pnpm gortach --root <тека справ>        # перегляд банки: сумніви, вибірка, відсоток помилок
pnpm familysearch:tree fetch <тека> --root <id>   # дерево FamilySearch у банку
pnpm build:skill                        # зібрати скрипти скіла з src/ (після кожної зміни в src/)
```

*Imennyk prepares data for loading into the Grapa genealogy database, above all by indexing people in archival documents: scans in, a bank (a local SQLite database of persons, events and ties) out.*

## Ліцензія
[Apache 2.0](LICENSE).
