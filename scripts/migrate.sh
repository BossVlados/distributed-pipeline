#!/bin/bash
# scripts/migrate.sh

# Переменные подключения к БД из docker-compose.yml
DB_HOST="postgres"
DB_PORT="5432"
DB_USER="pipeline"
DB_PASSWORD="pipeline123"
DB_NAME="pipeline"

# Строка подключения
CONN_STRING="postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=disable"

# Путь к миграциям (локальный путь внутри контейнера будет смонтирован)
MIGRATIONS_PATH="/migrations"

# Команда: up, down, force и т.д.
COMMAND=${1:-up}

docker run --rm \
  --network distributed-pipeline_default \
  -v $(pwd)/migrations:/migrations \
  migrate/migrate \
  -path ${MIGRATIONS_PATH} \
  -database ${CONN_STRING} \
  ${COMMAND}