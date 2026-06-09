package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-redis/redis/v8"
	_ "github.com/lib/pq"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

var ctx = context.Background()

func main() {
	// Чтение переменных окружения
	redisAddr := os.Getenv("REDIS_HOST") + ":" + os.Getenv("REDIS_PORT")
	minioEndpoint := os.Getenv("MINIO_ENDPOINT") + ":" + os.Getenv("MINIO_PORT")
	bucket := os.Getenv("MINIO_BUCKET")

	// Подключение к Redis
	rdb := redis.NewClient(&redis.Options{
		Addr: redisAddr,
	})
	if err := rdb.Ping(ctx).Err(); err != nil {
		log.Fatalf("Redis connection failed: %v", err)
	}

	// Подключение к MinIO
	minioClient, err := minio.New(minioEndpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(os.Getenv("MINIO_ACCESS_KEY"), os.Getenv("MINIO_SECRET_KEY"), ""),
		Secure: false,
	})
	if err != nil {
		log.Fatalf("MinIO connection error: %v", err)
	}

	// Подключение к PostgreSQL
	psqlInfo := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		os.Getenv("POSTGRES_HOST"), os.Getenv("POSTGRES_PORT"),
		os.Getenv("POSTGRES_USER"), os.Getenv("POSTGRES_PASSWORD"),
		os.Getenv("POSTGRES_DB"))
	db, err := sql.Open("postgres", psqlInfo)
	if err != nil {
		log.Fatalf("DB connection error: %v", err)
	}
	defer db.Close()
	db.SetMaxOpenConns(10)

	// Настройка Consumer Group
	streamName := "file:uploaded"
	groupName := "go-workers"
	consumerName := fmt.Sprintf("go-consumer-%d", time.Now().Unix())

	// Создаём группу (если нет)
	err = rdb.XGroupCreateMkStream(ctx, streamName, groupName, "0").Err()
	if err != nil && err.Error() != "BUSYGROUP Consumer Group name already exists" {
		log.Printf("Warning creating group: %v", err)
	}

	log.Println("Golang worker started, waiting for messages...")

	// Graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	// Запускаем обработчик в горутине
	go func() {
		for {
			// Читаем сообщения из потока
			streams, err := rdb.XReadGroup(ctx, &redis.XReadGroupArgs{
				Group:    groupName,
				Consumer: consumerName,
				Streams:  []string{streamName, ">"},
				Count:    1,
				Block:    5 * time.Second,
			}).Result()
			if err != nil {
				if err == redis.Nil {
					continue
				}
				log.Printf("XReadGroup error: %v", err)
				time.Sleep(1 * time.Second)
				continue
			}

			for _, stream := range streams {
				for _, message := range stream.Messages {
					log.Printf("Received message: %+v", message.Values)

					// Извлекаем поля (значения могут быть interface{})
					taskID, _ := message.Values["task_id"].(string)
					userID, _ := message.Values["user_id"].(string)
					minioPath, _ := message.Values["minio_path"].(string)
					originalFilename, _ := message.Values["original_filename"].(string)

					if taskID == "" {
						log.Printf("Invalid message, missing task_id")
						rdb.XAck(ctx, streamName, groupName, message.ID)
						continue
					}

					// Обновляем статус на "parsing"
					_, err = db.Exec(`UPDATE tasks SET status = 'parsing', updated_at = NOW() WHERE id = $1`, taskID)
					if err != nil {
						log.Printf("Failed to update status to parsing: %v", err)
						rdb.XAck(ctx, streamName, groupName, message.ID)
						continue
					}

					// Скачиваем файл из MinIO
					obj, err := minioClient.GetObject(ctx, bucket, minioPath, minio.GetObjectOptions{})
					if err != nil {
						log.Printf("Failed to download from MinIO: %v", err)
						updateTaskError(db, taskID, "MinIO download failed: "+err.Error())
						rdb.XAck(ctx, streamName, groupName, message.ID)
						continue
					}
					// Получаем информацию о файле (размер)
					stat, err := obj.Stat()
					if err != nil {
						log.Printf("Failed to stat object: %v", err)
						obj.Close()
						updateTaskError(db, taskID, "Failed to stat file")
						rdb.XAck(ctx, streamName, groupName, message.ID)
						continue
					}
					obj.Close()

					// Открываем заново для копирования (имитируем парсинг)
					obj2, err := minioClient.GetObject(ctx, bucket, minioPath, minio.GetObjectOptions{})
					if err != nil {
						log.Printf("Failed to reopen object: %v", err)
						updateTaskError(db, taskID, "Failed to reopen file")
						rdb.XAck(ctx, streamName, groupName, message.ID)
						continue
					}
					parsedPath := fmt.Sprintf("parsed/%s_%s", taskID, originalFilename)
					_, err = minioClient.PutObject(ctx, bucket, parsedPath, obj2, stat.Size, minio.PutObjectOptions{})
					obj2.Close()
					if err != nil {
						log.Printf("Failed to upload parsed file: %v", err)
						updateTaskError(db, taskID, "MinIO upload failed: "+err.Error())
						rdb.XAck(ctx, streamName, groupName, message.ID)
						continue
					}

					// Обновляем статус на "parsed"
					_, err = db.Exec(`UPDATE tasks SET status = 'parsed', updated_at = NOW() WHERE id = $1`, taskID)
					if err != nil {
						log.Printf("Failed to update status to parsed: %v", err)
						rdb.XAck(ctx, streamName, groupName, message.ID)
						continue
					}

					// Отправляем сообщение Python-воркеру
					_, err = rdb.XAdd(ctx, &redis.XAddArgs{
						Stream: "file:parsed",
						Values: map[string]interface{}{
							"task_id":           taskID,
							"user_id":           userID,
							"parsed_minio_path": parsedPath,
							"original_filename": originalFilename,
						},
					}).Result()
					if err != nil {
						log.Printf("Failed to send to parsed stream: %v", err)
					}

					// Подтверждаем обработку исходного сообщения
					rdb.XAck(ctx, streamName, groupName, message.ID)
					log.Printf("Task %s processed successfully by Go worker", taskID)
				}
			}
		}
	}()

	// Ожидаем сигнал завершения
	<-sigChan
	log.Println("Shutting down gracefully...")
}

func updateTaskError(db *sql.DB, taskID string, errMsg string) {
	_, err := db.Exec(`UPDATE tasks SET status = 'failed', error_message = $1, updated_at = NOW() WHERE id = $2`, errMsg, taskID)
	if err != nil {
		log.Printf("Failed to update task error: %v", err)
	}
}
