.PHONY: up down logs migrate clean

up:
	docker-compose up -d

down:
	docker-compose down

logs:
	docker-compose logs -f

clean:
	docker-compose down -v
	rm -rf minio_data postgres_data redis_data

# Позже добавим команду для миграций
migrate:
	@echo "Миграции пока не настроены"