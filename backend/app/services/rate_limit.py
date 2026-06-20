from __future__ import annotations

from dataclasses import dataclass
from math import ceil
from time import time
from typing import Protocol


@dataclass(frozen=True)
class RateLimitExceededError(Exception):
    retry_after_seconds: int


class RateLimiter(Protocol):
    def check(self, *, key: str, now: float | None = None) -> None: ...


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
