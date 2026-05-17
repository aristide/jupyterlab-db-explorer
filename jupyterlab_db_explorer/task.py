"""Task store + result-session lifecycle.

Each query produces a ResultSession that lives in the task store for a
TTL window after completion. Older sessions are evicted (cursor closed)
when the LRU cap is hit. Lookups refresh `last_access` so active sessions
stay warm.
"""

from __future__ import annotations

import asyncio
import logging
import os
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from .const import ENV_MAX_CACHED_RESULTS, ENV_RESULT_TTL_SEC
from .result_session import ResultSession, open_session

logger = logging.getLogger(__name__)

DEFAULT_TTL_SEC = 600
DEFAULT_MAX_CACHED = 16


def _int_env(name: str, fallback: int) -> int:
    raw = os.environ.get(name)
    if not raw:
        return fallback
    try:
        val = int(raw)
        return val if val > 0 else fallback
    except ValueError:
        return fallback


def _ttl_sec() -> int:
    return _int_env(ENV_RESULT_TTL_SEC, DEFAULT_TTL_SEC)


def _max_cached() -> int:
    return _int_env(ENV_MAX_CACHED_RESULTS, DEFAULT_MAX_CACHED)


@dataclass
class TaskEntry:
    # During the "running" phase, `future` resolves to a ResultSession once
    # the cursor is open. After resolution, `session` is set and `future`
    # left for reference (final-state).
    future: Optional[asyncio.Future]
    session: Optional[ResultSession] = None
    last_access: float = field(default_factory=time.time)
    cancelled: bool = False


task_dict: Dict[str, TaskEntry] = {}
_evict_lock = threading.Lock()


def _evict_expired() -> None:
    """Drop entries past TTL; if still over cap, drop the oldest by last_access."""
    now = time.time()
    ttl = _ttl_sec()
    cap = _max_cached()
    with _evict_lock:
        # First sweep — drop expired.
        for tid in list(task_dict.keys()):
            entry = task_dict[tid]
            if entry.session is not None and (now - entry.last_access) > ttl:
                try:
                    entry.session.close()
                except Exception as e:
                    logger.debug("evict close error: %s", e)
                task_dict.pop(tid, None)
        # Second sweep — LRU bound. Only counts ready sessions; running ones
        # (no session yet) shouldn't be killed in mid-execution.
        ready = [(tid, e.last_access) for tid, e in task_dict.items() if e.session is not None]
        if len(ready) > cap:
            ready.sort(key=lambda kv: kv[1])
            for tid, _ in ready[: len(ready) - cap]:
                entry = task_dict.pop(tid, None)
                if entry and entry.session is not None:
                    try:
                        entry.session.close()
                    except Exception as e:
                        logger.debug("LRU close error: %s", e)


def _touch(taskid: str) -> Optional[TaskEntry]:
    entry = task_dict.get(taskid)
    if entry is not None:
        entry.last_access = time.time()
    return entry


# ─── Public API ─────────────────────────────────────────────────────────────
async def create_query_task(dbid: str, sql: str, usedb: Optional[str] = None) -> str:
    """Schedule a cursor-open job; return the taskid the client uses to poll."""
    loop = asyncio.get_event_loop()
    fut = loop.run_in_executor(None, open_session, dbid, sql, usedb)
    taskid = str(uuid.uuid4())
    task_dict[taskid] = TaskEntry(future=fut)
    _evict_expired()
    return taskid


async def get_result(taskid: str, timeout: int = 118):
    """Wait for the cursor to be open, return the first page + metadata."""
    entry = task_dict.get(taskid)
    if entry is None:
        return False, {'error': 'task not exists'}

    if entry.session is None:
        # Still opening.
        done, _ = await asyncio.wait(
            {entry.future}, timeout=timeout, return_when=asyncio.FIRST_COMPLETED
        )
        if entry.future not in done:
            return False, {'error': 'RETRY', 'data': taskid}
        try:
            session = entry.future.result()
        except Exception as e:
            task_dict.pop(taskid, None)
            return False, {'error': str(e)}
        entry.session = session

    entry.last_access = time.time()
    session = entry.session
    first_page = session.fetch_page(0, session.page_size)
    payload = {
        'columns': session.columns,
        'dtypes': session.dtypes,
        'stats': session.stats_snapshot(),
        'total_rows': session.total_rows,
        'cursor_exhausted': session.cursor_exhausted,
        'taskid': taskid,
        'page_size': session.page_size,
        'data': first_page,
    }
    return True, payload


def get_page(taskid: str, offset: int, limit: int):
    """Synchronous page fetch (handler wraps in run_in_executor if needed)."""
    entry = _touch(taskid)
    if entry is None or entry.session is None:
        return False, {'error': 'task not exists'}
    rows = entry.session.fetch_page(offset, limit)
    return True, {
        'data': rows,
        'total_rows': entry.session.total_rows,
        'cursor_exhausted': entry.session.cursor_exhausted,
    }


def get_stats(taskid: str):
    entry = _touch(taskid)
    if entry is None or entry.session is None:
        return False, {'error': 'task not exists'}
    sess = entry.session
    return True, {
        'stats': sess.stats_snapshot(),
        'rows_seen': sess._next_row,
        'total_rows': sess.total_rows,
        'cursor_exhausted': sess.cursor_exhausted,
    }


async def delete(taskid: str) -> bool:
    entry = task_dict.pop(taskid, None)
    if entry is None:
        return False
    entry.cancelled = True
    if entry.future is not None and not entry.future.done():
        entry.future.cancel()
    if entry.session is not None:
        try:
            entry.session.close()
        except Exception as e:
            logger.debug("delete close error: %s", e)
    return True
