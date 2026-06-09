import os
import json
import logging
import signal
import sys
import time
import io

import redis
import pandas as pd
import numpy as np
from minio import Minio
import psycopg2

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Переменные окружения
REDIS_HOST = os.getenv('REDIS_HOST', 'redis')
REDIS_PORT = int(os.getenv('REDIS_PORT', 6379))
MINIO_ENDPOINT = os.getenv('MINIO_ENDPOINT', 'minio:9000')
MINIO_ACCESS_KEY = os.getenv('MINIO_ACCESS_KEY', 'minioadmin')
MINIO_SECRET_KEY = os.getenv('MINIO_SECRET_KEY', 'minioadmin')
MINIO_BUCKET = os.getenv('MINIO_BUCKET', 'pipeline-files')
POSTGRES_HOST = os.getenv('POSTGRES_HOST', 'postgres')
POSTGRES_PORT = int(os.getenv('POSTGRES_PORT', 5432))
POSTGRES_USER = os.getenv('POSTGRES_USER', 'pipeline')
POSTGRES_PASSWORD = os.getenv('POSTGRES_PASSWORD', 'pipeline123')
POSTGRES_DB = os.getenv('POSTGRES_DB', 'pipeline')

# Подключения
redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
minio_client = Minio(
    MINIO_ENDPOINT,
    access_key=MINIO_ACCESS_KEY,
    secret_key=MINIO_SECRET_KEY,
    secure=False
)

db_conn = psycopg2.connect(
    host=POSTGRES_HOST,
    port=POSTGRES_PORT,
    user=POSTGRES_USER,
    password=POSTGRES_PASSWORD,
    dbname=POSTGRES_DB
)
db_conn.autocommit = False

def update_task_status(task_id: str, status: str, result: dict = None, error: str = None):
    with db_conn.cursor() as cur:
        if result:
            cur.execute(
                "UPDATE tasks SET status = %s, result = %s, updated_at = NOW() WHERE id = %s",
                (status, json.dumps(result), task_id)
            )
        elif error:
            cur.execute(
                "UPDATE tasks SET status = %s, error_message = %s, updated_at = NOW() WHERE id = %s",
                (status, error, task_id)
            )
        else:
            cur.execute(
                "UPDATE tasks SET status = %s, updated_at = NOW() WHERE id = %s",
                (status, task_id)
            )
        db_conn.commit()

def analyze_file(file_content: bytes, filename: str) -> dict:
    """
    Пример аналитики: загружаем данные в pandas (CSV/JSON/Excel).
    Для демонстрации предполагаем, что файл CSV с колонками 'value' и 'category'.
    Если не CSV, возвращаем базовую статистику.
    """
    result = {}
    try:
        # Пытаемся прочитать как CSV
        df = pd.read_csv(io.BytesIO(file_content))
        result['type'] = 'csv'
        result['rows'] = len(df)
        result['columns'] = list(df.columns)
        result['numeric_summary'] = {}
        for col in df.select_dtypes(include=[np.number]).columns:
            result['numeric_summary'][col] = {
                'mean': float(df[col].mean()),
                'std': float(df[col].std()),
                'min': float(df[col].min()),
                'max': float(df[col].max())
            }
        if 'category' in df.columns:
            result['category_counts'] = df['category'].value_counts().head(5).to_dict()
    except Exception:
        # Не CSV – сохраняем размер и превью
        result['type'] = 'binary or text'
        result['size_bytes'] = len(file_content)
        try:
            preview = file_content[:200].decode('utf-8', errors='ignore')
            result['preview'] = preview
        except:
            result['preview'] = 'Binary data, cannot preview'
    return result

def process_message(message: dict):
    """Обработка одного сообщения из потока file:parsed"""
    try:
        task_id = message['task_id']
        parsed_path = message['parsed_minio_path']
        original_filename = message.get('original_filename', 'unknown')

        logger.info(f"Processing task {task_id}, file {parsed_path}")

        update_task_status(task_id, 'processing')

        # Скачиваем файл из MinIO
        try:
            response = minio_client.get_object(MINIO_BUCKET, parsed_path)
            file_data = response.read()
            response.close()
            response.release_conn()
        except Exception as e:
            logger.error(f"MinIO download error: {e}")
            update_task_status(task_id, 'failed', error=f"MinIO download failed: {str(e)}")
            return

        analysis_result = analyze_file(file_data, original_filename)
        update_task_status(task_id, 'completed', result=analysis_result)
        logger.info(f"Task {task_id} completed successfully")

    except Exception as e:
        logger.exception(f"Unexpected error: {e}")
        if 'task_id' in locals():
            update_task_status(task_id, 'failed', error=str(e))

def main():
    stream = 'file:parsed'
    group = 'python-workers'
    consumer_id = f'python-consumer-{int(time.time())}'

    try:
        redis_client.xgroup_create(stream, group, id='0', mkstream=True)
    except redis.ResponseError as e:
        if 'BUSYGROUP' not in str(e):
            logger.warning(f"Group creation error: {e}")

    logger.info(f"Python worker started, listening to stream {stream}")

    running = True
    def shutdown(sig, frame):
        nonlocal running
        logger.info("Shutting down...")
        running = False

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    while running:
        try:
            result = redis_client.xreadgroup(
                groupname=group,
                consumername=consumer_id,
                streams={stream: '>'},
                count=1,
                block=5000
            )
            if not result:
                continue

            for stream_name, messages in result:
                for msg in messages:
                    msg_id = msg[0]
                    data = msg[1]
                    process_message(data)
                    redis_client.xack(stream_name, group, msg_id)
        except Exception as e:
            logger.error(f"Consumer loop error: {e}")
            time.sleep(1)

    db_conn.close()
    redis_client.close()
    logger.info("Python worker stopped")

if __name__ == '__main__':
    main()