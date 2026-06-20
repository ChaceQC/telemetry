from __future__ import annotations

import pytest
from redis.exceptions import ConnectionError as RedisConnectionError

from app.services.rate_limit import (
    RateLimiterUnavailableError,
    RateLimitExceededError,
    RedisFixedWindowRateLimiter,
)


class FakeRedisRateLimitClient:
    def __init__(self) -> None:
        self.counts: dict[str, int] = {}
        self.expirations: dict[str, int] = {}

    def incr(self, name: str) -> int:
        self.counts[name] = self.counts.get(name, 0) + 1
        return self.counts[name]

    def expire(self, name: str, time: int) -> bool:
        self.expirations[name] = time
        return True


class FailingRedisRateLimitClient:
    def incr(self, name: str) -> int:
        raise RedisConnectionError("redis unavailable")

    def expire(self, name: str, time: int) -> bool:
        raise AssertionError("expire should not be called after incr failure")


def test_redis_fixed_window_rate_limiter_counts_shared_window() -> None:
    client = FakeRedisRateLimitClient()
    limiter = RedisFixedWindowRateLimiter(
        enabled=True,
        limit=2,
        window_seconds=60,
        client=client,
        key_prefix="telemetry-test",
    )

    limiter.check(key="rate_limit:api_key:1", now=120.0)
    limiter.check(key="rate_limit:api_key:1", now=121.0)
    with pytest.raises(RateLimitExceededError) as error:
        limiter.check(key="rate_limit:api_key:1", now=122.0)

    assert error.value.retry_after_seconds == 58
    assert client.counts["telemetry-test:rate_limit:api_key:1:120"] == 3
    assert client.expirations["telemetry-test:rate_limit:api_key:1:120"] == 60


def test_redis_fixed_window_rate_limiter_resets_next_window() -> None:
    client = FakeRedisRateLimitClient()
    limiter = RedisFixedWindowRateLimiter(
        enabled=True,
        limit=1,
        window_seconds=60,
        client=client,
        key_prefix="telemetry-test",
    )

    limiter.check(key="rate_limit:api_key:1", now=120.0)
    limiter.check(key="rate_limit:api_key:1", now=180.0)

    assert client.counts["telemetry-test:rate_limit:api_key:1:120"] == 1
    assert client.counts["telemetry-test:rate_limit:api_key:1:180"] == 1


def test_redis_fixed_window_rate_limiter_skips_redis_when_disabled() -> None:
    limiter = RedisFixedWindowRateLimiter(
        enabled=False,
        limit=1,
        window_seconds=60,
        client=FailingRedisRateLimitClient(),
    )

    limiter.check(key="rate_limit:api_key:1", now=120.0)


def test_redis_fixed_window_rate_limiter_maps_redis_errors() -> None:
    limiter = RedisFixedWindowRateLimiter(
        enabled=True,
        limit=1,
        window_seconds=60,
        client=FailingRedisRateLimitClient(),
    )

    with pytest.raises(RateLimiterUnavailableError):
        limiter.check(key="rate_limit:api_key:1", now=120.0)
