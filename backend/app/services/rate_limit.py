from __future__ import annotations

from dataclasses import dataclass
from math import ceil
from time import time
from typing import Protocol

from redis import Redis
from redis.exceptions import RedisError


@dataclass(frozen=True)
class RateLimitExceededError(Exception):
    retry_after_seconds: int


class RateLimiterUnavailableError(Exception):
    pass


class RateLimiter(Protocol):
    def check(self, *, key: str, now: float | None = None) -> None: ...


class RedisRateLimitClient(Protocol):
    def incr(self, name: str) -> int: ...

    def expire(self, name: str, time: int) -> object: ...


@dataclass
class _WindowCounter:
    window_start: float
    count: int


class InMemoryFixedWindowRateLimiter:
    def __init__(self, *, enabled: bool, limit: int, window_seconds: int) -> None:
        self._enabled = enabled
        self._limit = limit
        self._window_seconds = window_seconds
        self._counters: dict[str, _WindowCounter] = {}

    def check(self, *, key: str, now: float | None = None) -> None:
        if not self._enabled:
            return

        current_time = time() if now is None else now
        counter = self._counters.get(key)
        if counter is None or current_time - counter.window_start >= self._window_seconds:
            self._counters[key] = _WindowCounter(window_start=current_time, count=1)
            return

        if counter.count >= self._limit:
            retry_after = ceil(self._window_seconds - (current_time - counter.window_start))
            raise RateLimitExceededError(retry_after_seconds=max(retry_after, 1))

        counter.count += 1


class RedisFixedWindowRateLimiter:
    def __init__(
        self,
        *,
        enabled: bool,
        limit: int,
        window_seconds: int,
        client: RedisRateLimitClient,
        key_prefix: str = "telemetry",
        unavailable_message: str = "限流服务不可用",
    ) -> None:
        self._enabled = enabled
        self._limit = limit
        self._window_seconds = window_seconds
        self._client = client
        self._key_prefix = key_prefix.rstrip(":")
        self._unavailable_message = unavailable_message

    def check(self, *, key: str, now: float | None = None) -> None:
        if not self._enabled:
            return

        current_time = time() if now is None else now
        window_start = int(current_time // self._window_seconds) * self._window_seconds
        redis_key = f"{self._key_prefix}:{key}:{window_start}"
        try:
            count = self._client.incr(redis_key)
            if count == 1:
                self._client.expire(redis_key, self._window_seconds)
        except RedisError as error:
            raise RateLimiterUnavailableError(self._unavailable_message) from error

        if count > self._limit:
            retry_after = ceil(self._window_seconds - (current_time - window_start))
            raise RateLimitExceededError(retry_after_seconds=max(retry_after, 1))


def create_fixed_window_rate_limiter(
    *,
    enabled: bool,
    limit: int,
    window_seconds: int,
    backend: str,
    redis_url: str,
    key_prefix: str = "telemetry",
    unavailable_message: str = "限流服务不可用",
) -> RateLimiter:
    if backend == "memory":
        return InMemoryFixedWindowRateLimiter(
            enabled=enabled,
            limit=limit,
            window_seconds=window_seconds,
        )
    if backend == "redis":
        return RedisFixedWindowRateLimiter(
            enabled=enabled,
            limit=limit,
            window_seconds=window_seconds,
            client=Redis.from_url(redis_url, decode_responses=True),
            key_prefix=key_prefix,
            unavailable_message=unavailable_message,
        )
    raise ValueError("unsupported rate limit backend")


def create_ingest_rate_limiter(
    *,
    enabled: bool,
    limit: int,
    window_seconds: int,
    backend: str,
    redis_url: str,
    key_prefix: str = "telemetry",
) -> RateLimiter:
    return create_fixed_window_rate_limiter(
        enabled=enabled,
        limit=limit,
        window_seconds=window_seconds,
        backend=backend,
        redis_url=redis_url,
        key_prefix=key_prefix,
        unavailable_message="摄入限流服务不可用",
    )
