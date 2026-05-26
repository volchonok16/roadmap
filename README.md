# TFS Roadmap

Приложение выгружает доски TFS, ЗНИ и связанные требования, сохраняет их в Postgres и рисует roadmap с фильтрами по доске и периоду.

## Запуск

1. Скопируйте `.env.example` в `.env` и при необходимости поправьте только серверные настройки выгрузки.
2. Запустите:

```bash
docker compose up --build
```

Локальный доступ к Postgres на порту 5432 (опционально):

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

Frontend: http://localhost:5173  
Backend: http://localhost:8000/api/health

## Production (pallink.fun)

Nginx + Certbot + Docker: см. [deploy/DEPLOY.md](deploy/DEPLOY.md).

```bash
cp .env.production.example .env
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
```

3. На форме входа укажите `Project`, при необходимости `Project ID`, и один из способов авторизации: PAT, доменный логин/пароль или Cookie из браузерной сессии TFS.

## Как устроена выгрузка

- `GET /Tele2/_boards/directory` сохраняет доски TFS в таблицу `boards`. Если directory не возвращает список, backend умеет fallback на Favorites API при заполненном `Project ID` на форме входа.
- `POST /Tele2/_apis/wit/wiql` выбирает ЗНИ со статусами из `CHANGE_REQUEST_STATES`.
- `POST /Tele2/_apis/wit/workItemsBatch` пакетно загружает все доступные поля ЗНИ и связанных work items.
- Для ЗНИ дополнительно вызывается `ms.vss-work-web.work-item-data-provider`, чтобы сохранить compact-поля из UI (`10050`, `-7`, `relations`, `referencedPersons`, `referencedNodes`).
- В `work_items` сохраняются все связанные work items и полный JSON; в `requirements` отдельно попадают элементы с `System.WorkItemType = Требование`.
- Кнопка "Обновить выгрузку" запускает синхронизацию и обновляет статусы без пересоздания данных.

## Важные настройки

Точное поле стартовой даты нужно подтвердить на raw JSON ЗНИ. Сейчас backend берет первое найденное поле из:

```text
TFS_START_DATE_FIELDS=Custom.StartDate,Microsoft.VSTS.Scheduling.StartDate,10000,10001,12731,32,System.CreatedDate
```

Целевая дата берется из:

```text
TFS_TARGET_DATE_FIELDS=10050,Microsoft.VSTS.Scheduling.TargetDate,Custom.TargetDate,Custom.DueDate,Microsoft.VSTS.Scheduling.FinishDate
```

Чтобы не перегружать TFS, выгрузка идет через `workItemsBatch` с лимитом `TFS_BATCH_SIZE` и паузой `TFS_REQUEST_DELAY_SECONDS` между пакетами.

## Авторизация

**Почему нельзя «просто взять» соседнюю вкладку TFS:** страница Roadmap на `localhost` не имеет доступа к cookie домена `tfs.t2.ru` (политика same-origin). Нужно один раз передать cookie с вкладки TFS или через расширение.

**Если TFS уже открыт в соседней вкладке** — самый простой путь:

1. Установите расширение из папки `browser-extension` (Chrome → Расширения → Загрузить распакованное).
2. Откройте Roadmap на http://localhost:5173.
3. Нажмите иконку расширения → **Подключить к Roadmap** (читает HttpOnly-cookie SSO).

Без расширения: на вкладке `tfs.t2.ru` нажмите закладку «Подключить Roadmap» или вставьте скрипт из консоли (F12).

Рекомендуемый способ под VPN — **сессия браузера**:

1. На форме входа нажмите «Открыть TFS» и войдите в `tfs.t2.ru` в той же сети.
2. На вкладке TFS выполните закладку «Подключить Roadmap» или вставьте скрипт из «Скопировать для консоли (F12)».
3. Если SSO не отдаёт cookie в закладку — скопируйте заголовок `Cookie` из DevTools (Network) и вставьте в форму.

Также доступны PAT и доменный логин/пароль. Backend проверяет доступ к TFS и хранит сессию только в памяти процесса. Секреты не пишутся в `.env` и не сохраняются в Postgres.

## Оптимизация выгрузки

- Пакеты `workItemsBatch` ограничены `TFS_BATCH_SIZE` (по умолчанию 100) с паузой `TFS_REQUEST_DELAY_SECONDS`.
- Compact-поля UI запрашиваются параллельно с лимитом `TFS_COMPACT_CONCURRENCY` (по умолчанию 4).
- Повторное нажатие «Обновить выгрузку» в течение `SYNC_BUTTON_COOLDOWN_SECONDS` не запускает новый sync.

## Аналитика по сырым данным

Каждый work item хранит `fields`, `compact_fields`, `relations`, `referenced_persons`, `referenced_nodes` и `raw` в `JSONB`. Для быстрой проверки доступен endpoint:

```text
GET /api/work-items/{id}/raw
```
