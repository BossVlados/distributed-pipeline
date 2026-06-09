#!/bin/bash
# Автоматически определяем сеть docker-compose
COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME:-$(basename $(pwd) | tr '[:upper:]' '[:lower:]')}
NETWORK="${COMPOSE_PROJECT_NAME}_default"

DB_HOST="postgres"
DB_PORT="5432"
DB_USER="pipeline"
DB_PASSWORD="pipeline123"
DB_NAME="pipeline"

CONN_STRING="postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=disable"
MIGRATIONS_PATH="/migrations"
COMMAND=${1:-up}

docker run --rm \
  --network ${NETWORK} \
  -v $(pwd)/migrations:/migrations \
  migrate/migrate \
  -path ${MIGRATIONS_PATH} \
  -database ${CONN_STRING} \
  ${COMMAND}