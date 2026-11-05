# Іменник

Відкритий репозиторій підготовки даних для заливки в криницю (базу [Grapa](https://github.com/solvek/grapa)), насамперед витягування людей з архівних документів: на вході скани справи, на виході **банка** — локальна база SQLite з особами, подіями, зв'язками, місцями й сумнівами.

Код перенесено з Grapa разом з історією. Мета, межі й етапи — [docs/overview.md](docs/overview.md); порядок читання сканів — [docs/scan-extraction.md](docs/scan-extraction.md).

## Запуск
Потрібні Node.js 24 і pnpm.

```bash
pnpm install
pnpm indexing init <тека справи>        # банка справи; інші команди — docs/scan-extraction.md
pnpm gortach --root <тека справ>        # перегляд банки: сумніви, вибірка, відсоток помилок
pnpm familysearch:tree fetch <тека> --root <id>   # дерево FamilySearch у банку (docs/familysearch-tree.md)
```

*Imennyk prepares data for loading into the Grapa genealogy database, above all by indexing people in archival documents: scans in, a bank (a local SQLite database of persons, events and ties) out.*

## Ліцензія
[Apache 2.0](LICENSE).
