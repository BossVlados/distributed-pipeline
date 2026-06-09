.PHONY: up down logs clean start stop migrate migrate-down

up:
	docker-compose up -d

down:
	docker-compose down

logs:
	docker-compose logs -f

clean:
	docker-compose down -v
	rm -rf minio_data postgres_data redis_data

start:
	docker-compose start

stop:
	docker-compose stop

migrate:
	./scripts/migrate.sh up

migrate-down:
	./scripts/migrate.sh down

migrate-force:
	./scripts/migrate.sh force $(VERSION)