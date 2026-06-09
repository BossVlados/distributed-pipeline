# Distributed File Processing Pipeline с аналитикой в реальном времени

## Описание

Асинхронная распределённая система для загрузки, обработки и анализа файлов с веб-интерфейсом в реальном времени.

## Особенности
- **Загрузка файлов** (CSV, JSON, TXT) через веб-интерфейс или API.
- **Асинхронная обработка через Redis Streams** (слабая связанность микросервисов).
- **Быстрая валидация** на Golang + тяжёлая аналитика на Python (pandas, numpy).
_ **Автоматическое обновление статусов** через WebSocket (live-уведомления).
- **JWT-аутентификация** (регистрация/логин по email).
- **Результаты аналитики** сохраняются в PostgreSQL и отображаются в дашборде.
- **Docker Compos**e для лёгкого развёртывания одной командой.

## Стек технологий

- Frontend: Next.js 16 (React), Tailwind CSS, Socket.IO Client, Axios
- API Gateway (BFF): Node.js 20, Fastify, JWT, WebSocket (Socket.IO), Redis Streams producer
- Воркер (быстрый): Golang, Redis Streams consumer, MinIO client, PostgreSQL driver
- Воркер (аналитика): Python 3, pandas, numpy, Redis, MinIO, psycopg2
- База данных: PostgreSQL 15 (основная), индексы, JSONB для результатов
- Брокер сообщений: Redis 7 (Streams, Consumer Groups)
- Объектное хранилище: MinIO
- Оркестрация: Docker Compose

## Архитектура

```
[Next.js UI]  <--WebSocket-->  [Node.js API Gateway]  <--REST--> [PostgreSQL]
      |                              |
      | (upload)                     | (add task + stream)
      v                              v
 [MinIO/S3] <-----> [Redis Streams] <----> [Golang worker] -> [Parsed data] -> [Python worker]
                                           (validate/parse)                     (pandas analytics)
                                                                                         |
                                                                                         v
                                                                                  [PostgreSQL]
```

1. Пользователь загружает файл (txt, csv, xlxs) через Next.js фронтенд.

2. Node.js BFF сохраняет файл в MinIO, создаёт задачу в PostgreSQL и отправляет событие в Redis Stream `file:uploaded`.

3. Golang воркер читает сообщение, скачивает файл, выполняет быструю валидацию, загружает «распарсенный» файл обратно в MinIO и отправляет событие в `file:parsed`.

4. Python воркер забирает `file:parsed`, выполняет аналитику (pandas), сохраняет JSON-результат в PostgreSQL.

5. Фронтенд получает обновления статуса через WebSocket (Socket.IO) или через поллинг REST API.

Все сервисы запускаются в отдельных контейнерах, общаются через Redis Streams и MinIO – это позволяет легко масштабировать воркеры горизонтально.

## Управление сервисами

- Запуск: `docker-compose up -d`
- Остановка (сохранение данных): `docker-compose stop`
- Возобновление: `docker-compose start`
- Полная остановка с удалением контейнеров: `docker-compose down`
- Сброс всех данных: `docker-compose down -v`

### Или через MakeFile

- Запуск: `make up`
- Остановка (сохранение данных): `make stop`
- Возобновление: `make start`
- Полная остановка с удалением контейнеров: `make down`
- Сброс всех данных: `make clean`

## TODO
- Dead Letter Queue – обработка ошибочных сообщений с повторами.
- Метрики Prometheus + Grafana дашборды.
- Kubernetes манифесты для развёртывания в кластере.
- Поддержка большего числа форматов (Excel, Parquet).
- Тесты (unit, integration) для каждого микросервиса.
- CI/CD (GitHub Actions) – автоматическая сборка и публикация образов.
