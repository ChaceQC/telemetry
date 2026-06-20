from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy.orm import Session

_ATOMIC_DEPTH_KEY = "telemetry_atomic_depth"


def _atomic_depth(session: Session) -> int:
    return int(session.info.get(_ATOMIC_DEPTH_KEY, 0))


def flush_or_commit(session: Session) -> None:
    if _atomic_depth(session) > 0:
        session.flush()
        return
    session.commit()


@contextmanager
def session_transaction(session: Session) -> Iterator[None]:
    depth = _atomic_depth(session)
    session.info[_ATOMIC_DEPTH_KEY] = depth + 1
    try:
        yield
        if depth == 0:
            session.commit()
    except Exception:
        if depth == 0:
            session.rollback()
        raise
    finally:
        if depth == 0:
            session.info.pop(_ATOMIC_DEPTH_KEY, None)
        else:
            session.info[_ATOMIC_DEPTH_KEY] = depth
