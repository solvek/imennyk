# Tasks

## 1. Рішення власника

- [x] 1.1 Отримати відповіді на відкриті питання proposal (`tools/` поза ESLint, заморожена копія в Grapa, які словники переносити) і записати їх у proposal

## 2. Історія з Grapa

- [x] 2.1 Свіжий клон Grapa у `/var/tmp`; для кожного файлу з розкладки (design.md) зібрати старі шляхи (`git log --follow --name-only`)
- [x] 2.2 `git filter-repo` з `--path` і `--path-rename` за розкладкою
- [x] 2.3 Перевірити історію відфільтрованого клону: немає файлів поза розкладкою, немає банок, трекерів справ і `import/indexing/`; пошук імен з трекерів справ Grapa по всій історії нічого не знаходить
- [x] 2.4 Злити в Іменник (`git pull --allow-unrelated-histories`)

## 3. Розірвати зв'язки з Grapa

- [x] 3.1 Поправити відносні імпорти під нову розкладку
- [x] 3.2 `src/indexing/enums.ts` без `src/generated/db.ts`: типи з масивів, значення ті самі
- [x] 3.3 `src/familysearch/tree/cli.ts`: лишити `fetch` і `ingest`, прибрати `enter` і `places`; прибрати модулі й тести, що потребують PostgreSQL (частина `test/indexing/db.test.ts` про `pull`)
- [x] 3.4 `package.json`: скрипти `indexing`, `gortach`, `familysearch:tree`; `tools/` в `ignores` ESLint з коментарем про етап 3
- [x] 3.5 Перевірити, що жоден файл не імпортує шляхів Grapa і не звертається до PostgreSQL

## 4. Документи

- [x] 4.1 `docs/scan-extraction.md`: шляхи й команди Іменника; розділи про внесення в базу — посиланням на Grapa
- [x] 4.2 `docs/familysearch-browser.md`, `docs/familysearch-tree.md`: те саме; `familysearch-tree.md` без розділів «Внесення в криницю» і `places`
- [x] 4.3 `dictionaries/README.md`: що це і як використовувати
- [x] 4.4 `docs/overview.md`: етап 1 — ✓; `README.md`: як запустити `indexing` і `gortach`

## 5. Перевірка

- [x] 5.1 Прогнати `pnpm indexing init`, `scans`, `run-start`, `ingest`, `sample`, `run-report` і `pnpm gortach` на вигаданій справі; поведінка та сама, що в Grapa
- [x] 5.2 Звірити специфікацію `familysearch-tree-bank` з тестами `test/familysearch/tree/`; бракує тесту на вимогу — дописати
- [x] 5.3 `openspec validate move-from-grapa`
- [x] 5.4 `pnpm typecheck`, `pnpm lint`, `pnpm test`
