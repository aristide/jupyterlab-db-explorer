"""ResultSession — server-side streaming cursor for query results.

Holds an open SQLAlchemy `Result` in `stream_results=True` mode and serves
forward-only pages on demand. Caches every page it scrolls past so backward
scroll is free; running per-column statistics are accumulated as pages get
fetched.

Sort / filter / top-N / chart helpers live alongside so the task store can
delegate to a single object per active query.
"""

from __future__ import annotations

import datetime
import logging
import os
import threading
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

import sqlalchemy

from . import engine as engine_mod
from .const import (
    ENV_QUERY_LIMIT,
    ENV_RESULT_PAGE_SIZE,
)
from .serializer import make_row_serializable

logger = logging.getLogger(__name__)


DEFAULT_QUERY_LIMIT = 100_000
DEFAULT_PAGE_SIZE = 1_000


def _int_env(name: str, fallback: int) -> int:
    raw = os.environ.get(name)
    if not raw:
        return fallback
    try:
        val = int(raw)
        return val if val > 0 else fallback
    except ValueError:
        return fallback


# ─── Per-column running statistics ──────────────────────────────────────────
@dataclass
class ColumnStats:
    """Per-column aggregates updated row-by-row as the cursor advances."""

    dtype: str = 'string'              # 'number' | 'datetime' | 'string'
    count: int = 0                     # non-null values seen
    null_count: int = 0
    distinct: object = 0               # int up to 1000, then the string '1000+'
    min: Any = None
    max: Any = None
    sum: Optional[float] = None        # numeric only — used for mean
    _seen: Optional[set] = field(default=None, repr=False)

    DISTINCT_CAP = 1000

    def update(self, value: Any) -> None:
        if value is None:
            self.null_count += 1
            return
        self.count += 1
        # distinct (capped)
        if self.distinct != f'{self.DISTINCT_CAP}+':
            if self._seen is None:
                self._seen = set()
            try:
                self._seen.add(value)
                if len(self._seen) > self.DISTINCT_CAP:
                    self.distinct = f'{self.DISTINCT_CAP}+'
                    self._seen = None  # release memory
                else:
                    self.distinct = len(self._seen)
            except TypeError:
                # unhashable (list, dict) — drop distinct tracking
                self.distinct = f'{self.DISTINCT_CAP}+'
                self._seen = None

        if self.dtype == 'number':
            try:
                f = float(value)
            except (TypeError, ValueError):
                return
            if self.sum is None:
                self.sum = 0.0
            self.sum += f
            if self.min is None or f < self.min:
                self.min = f
            if self.max is None or f > self.max:
                self.max = f
        elif self.dtype == 'datetime':
            if self.min is None or value < self.min:
                self.min = value
            if self.max is None or value > self.max:
                self.max = value
        # strings: skip min/max — top-N popover covers it on demand.

    def snapshot(self) -> Dict[str, Any]:
        out: Dict[str, Any] = {
            'dtype': self.dtype,
            'count': self.count,
            'null_count': self.null_count,
            'distinct': self.distinct,
        }
        if self.dtype == 'number':
            if self.count > 0 and self.sum is not None:
                out['mean'] = self.sum / self.count
            if self.min is not None:
                out['min'] = self.min
            if self.max is not None:
                out['max'] = self.max
        elif self.dtype == 'datetime':
            if self.min is not None:
                out['min'] = self.min.isoformat() if hasattr(self.min, 'isoformat') else str(self.min)
            if self.max is not None:
                out['max'] = self.max.isoformat() if hasattr(self.max, 'isoformat') else str(self.max)
        return out


def _infer_dtype(value: Any) -> str:
    if isinstance(value, bool):
        # bool is a subclass of int; treat as string-categorical for stats.
        return 'string'
    if isinstance(value, (int, float, Decimal)):
        return 'number'
    if isinstance(value, (datetime.datetime, datetime.date)):
        return 'datetime'
    return 'string'


# ─── Session ────────────────────────────────────────────────────────────────
class ResultSession:
    """Owns one streaming cursor, a page cache, and running column stats."""

    def __init__(self, dbid: str, sql: str, usedb: Optional[str] = None):
        self.dbid = dbid
        self.sql = sql
        self.usedb = usedb
        self.page_size = _int_env(ENV_RESULT_PAGE_SIZE, DEFAULT_PAGE_SIZE)
        self.hard_cap = _int_env(ENV_QUERY_LIMIT, DEFAULT_QUERY_LIMIT)

        self.columns: List[str] = []
        self.dtypes: List[str] = []
        self.stats: List[ColumnStats] = []
        self.total_rows: Optional[int] = None  # None until cursor exhausts or hard_cap reached
        self.cursor_exhausted: bool = False

        # page_start (multiple of page_size) -> list of serialized rows
        self._pages: Dict[int, List[List[Any]]] = {}
        self._next_row: int = 0           # absolute position of the next row from cursor
        self._connection: Optional[Any] = None
        self._result: Optional[Any] = None
        self._lock = threading.Lock()

    # ── lifecycle ────────────────────────────────────────────────────────
    def open(self) -> None:
        eng = engine_mod.getEngine(self.dbid, self.usedb)
        if eng is None or eng is False:
            raise RuntimeError(f"could not get engine for dbid {self.dbid}")
        # stream_results=True asks the driver for a server-side cursor.
        conn = eng.connect().execution_options(stream_results=True)
        try:
            result = conn.exec_driver_sql(self.sql)
        except Exception:
            conn.close()
            raise
        self._connection = conn
        self._result = result

        if not result.returns_rows:
            # DDL / DML — drain and mark exhausted, no columns.
            try:
                conn.commit()
            except Exception:
                pass
            self.cursor_exhausted = True
            self.total_rows = 0
            return

        self.columns = list(result.keys())
        self.stats = [ColumnStats() for _ in self.columns]
        # Prime first page so we know dtypes from real data. Scroll a full
        # page so dtype inference + initial stats see a representative batch.
        self._scroll_to_offset(self.page_size)
        if self._pages.get(0):
            first_row = self._pages[0][0]
            for i, val in enumerate(first_row):
                self.stats[i].dtype = _infer_dtype(val)
            self.dtypes = [s.dtype for s in self.stats]
            # Replay the first row into stats now that dtype is known.
            for i, val in enumerate(first_row):
                self.stats[i].update(val)
            # Replay the rest of page 0 too.
            for row in self._pages[0][1:]:
                for i, val in enumerate(row):
                    self.stats[i].update(val)
        else:
            # Empty result — leave dtypes as defaults.
            self.dtypes = ['string' for _ in self.columns]

    def close(self) -> None:
        with self._lock:
            if self._result is not None:
                try:
                    self._result.close()
                except Exception as e:
                    logger.debug("error closing result: %s", e)
                self._result = None
            if self._connection is not None:
                try:
                    self._connection.close()
                except Exception as e:
                    logger.debug("error closing connection: %s", e)
                self._connection = None

    # ── page fetch ────────────────────────────────────────────────────────
    def fetch_page(self, offset: int, limit: int) -> List[List[Any]]:
        """Return rows in the half-open range [offset, offset+limit)."""
        if limit <= 0 or offset < 0:
            return []
        with self._lock:
            return self._fetch_page_locked(offset, limit)

    def _fetch_page_locked(self, offset: int, limit: int) -> List[List[Any]]:
        end = offset + limit
        self._scroll_to_offset(end)
        out: List[List[Any]] = []
        cursor = offset
        while cursor < end:
            page_start = (cursor // self.page_size) * self.page_size
            page = self._pages.get(page_start)
            if page is None:
                break
            page_end = page_start + len(page)
            if cursor >= page_end:
                break
            start_in_page = cursor - page_start
            stop_in_page = min(len(page), end - page_start)
            out.extend(page[start_in_page:stop_in_page])
            cursor = page_start + stop_in_page
        return out

    def _scroll_to_offset(self, target_offset: int) -> None:
        """Advance the cursor until self._next_row >= target_offset (or exhausted)."""
        if self.cursor_exhausted or self._result is None:
            return
        target = min(target_offset, self.hard_cap)
        # Fetch in page_size batches, caching each.
        while self._next_row < target and not self.cursor_exhausted:
            batch_size = min(self.page_size, target - self._next_row)
            rows = self._result.fetchmany(batch_size)
            if not rows:
                self.cursor_exhausted = True
                self.total_rows = self._next_row
                break
            # make_row_serializable yields tuples; cast to list for consistent
            # JSON wire shape (tuples and lists both serialize as arrays, but
            # tests and downstream consumers expect list).
            serialized = [list(make_row_serializable(r)) for r in rows]
            page_start = (self._next_row // self.page_size) * self.page_size
            offset_in_page = self._next_row - page_start
            page = self._pages.setdefault(page_start, [])
            # If we're starting a fresh page, just extend.
            if offset_in_page == len(page):
                page.extend(serialized)
            else:
                # Misaligned start (shouldn't normally happen since fetches are aligned),
                # rebuild deterministically by slotting.
                while len(page) < offset_in_page:
                    page.append([None] * len(self.columns))
                page.extend(serialized)
            # Update running stats (but skip during the open-phase priming,
            # which records dtypes itself).
            if self.dtypes:
                for row in serialized:
                    for i, val in enumerate(row):
                        self.stats[i].update(val)
            self._next_row += len(serialized)
            if len(serialized) < batch_size:
                self.cursor_exhausted = True
                self.total_rows = self._next_row
                break

        if self._next_row >= self.hard_cap and not self.cursor_exhausted:
            # Hit the cap — stop here but leave the cursor formally exhausted
            # so we don't keep scrolling forward on every page request.
            self.cursor_exhausted = True
            self.total_rows = self._next_row

    # ── stats snapshot ───────────────────────────────────────────────────
    def stats_snapshot(self) -> List[Dict[str, Any]]:
        return [s.snapshot() for s in self.stats]

    def metadata(self) -> Dict[str, Any]:
        return {
            'columns': self.columns,
            'dtypes': self.dtypes,
            'stats': self.stats_snapshot(),
            'total_rows': self.total_rows,
            'rows_seen': self._next_row,
            'cursor_exhausted': self.cursor_exhausted,
            'page_size': self.page_size,
        }


# ─── Module-level helper used by the task layer ────────────────────────────
def open_session(dbid: str, sql: str, usedb: Optional[str] = None) -> ResultSession:
    """Open a streaming ResultSession against `dbid` for `sql`."""
    sess = ResultSession(dbid, sql, usedb=usedb)
    sess.open()
    return sess
