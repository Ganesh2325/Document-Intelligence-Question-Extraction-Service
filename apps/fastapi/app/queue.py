from __future__ import annotations

import json
from datetime import datetime, timezone

from redis.asyncio import Redis

from .config import get_settings

QUEUE_NAME = "document-processing"
_redis: Redis | None = None


async def get_redis() -> Redis:
    global _redis
    if _redis is None:
        _redis = Redis.from_url(get_settings().REDIS_URL, decode_responses=True)
    return _redis


async def ping_redis() -> bool:
    client = await get_redis()
    return (await client.ping()) is True


async def enqueue_document_processing(payload: dict) -> str:
    job_id = f"{payload['documentId']}-v{payload['processingVersion']}"
    redis = await get_redis()
    await redis.lpush("folio:document-jobs", json.dumps(payload))
    prefix = f"bull:{QUEUE_NAME}"
    timestamp = int(datetime.now(timezone.utc).timestamp() * 1000)
    mapping = {
        "name": "process",
        "data": json.dumps(payload),
        "opts": json.dumps(
            {
                "attempts": 3,
                "backoff": {"type": "exponential", "delay": 4000},
                "jobId": job_id,
                "removeOnComplete": {"count": 200},
                "removeOnFail": {"count": 200},
            }
        ),
        "timestamp": str(timestamp),
        "delay": "0",
        "priority": "0",
    }
    pipe = redis.pipeline()
    pipe.hset(f"{prefix}:{job_id}", mapping=mapping)
    pipe.lpush(f"{prefix}:wait", job_id)
    await pipe.execute()
    return job_id


async def close_queue() -> None:
    global _redis
    if _redis is not None:
        await _redis.aclose()
        _redis = None
