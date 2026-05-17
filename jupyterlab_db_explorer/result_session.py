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
@dataclass
class FilterSpec:
    """A single filter applied to one column. op is one of 'contains',
    'equals', 'gt', 'lt', 'between' (between uses [min, max] for `value`)."""

    column: str
    op: str
    value: Any


class ResultSession:
    """Owns one streaming cursor, a page cache, and running column stats.

    Sort + filter overlays close the current cursor and open a fresh one with
    the user SQL wrapped in a CTE; top-N value lookup runs an independent
    aggregation query that doesn't disturb the cursor.
    """

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

        # Active sort / filter overlays. None means no overlay.
        self.sort: Optional[Tuple[str, str]] = None  # (column, 'ASC' | 'DESC')
        self.filters: List[FilterSpec] = []

        # page_start (multiple of page_size) -> list of serialized rows
        self._pages: Dict[int, List[List[Any]]] = {}
        self._next_row: int = 0           # absolute position of the next row from cursor
        self._connection: Optional[Any] = None
        self._result: Optional[Any] = None
        self._engine: Optional[Any] = None  # cached so sort/filter can reopen
        self._lock = threading.Lock()

    # ── lifecycle ────────────────────────────────────────────────────────
    def open(self) -> None:
        eng = engine_mod.getEngine(self.dbid, self.usedb)
        if eng is None or eng is False:
            raise RuntimeError(f"could not get engine for dbid {self.dbid}")
        self._engine = eng
        self._open_cursor(self._effective_sql())

    def close(self) -> None:
        with self._lock:
            self._close_cursor_locked()

    def _close_cursor_locked(self) -> None:
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

    def _open_cursor(self, sql: str) -> None:
        """Open (or re-open) the streaming cursor on `sql` and prime page 0."""
        if self._engine is None:
            raise RuntimeError("session has no engine — call open() first")
        conn = self._engine.connect().execution_options(stream_results=True)
        try:
            result = conn.exec_driver_sql(sql)
        except Exception:
            conn.close()
            raise
        self._connection = conn
        self._result = result
        self._pages = {}
        self._next_row = 0
        self.cursor_exhausted = False
        self.total_rows = None

        if not result.returns_rows:
            try:
                conn.commit()
            except Exception:
                pass
            self.cursor_exhausted = True
            self.total_rows = 0
            return

        new_columns = list(result.keys())
        # First-open initializes columns + stats; sort/filter re-opens keep
        # the existing column shape (same query, just re-ordered/filtered).
        if not self.columns:
            self.columns = new_columns
            self.stats = [ColumnStats() for _ in self.columns]
        else:
            # Reset stats accumulators when overlays change so we don't
            # leak counts from the previous cursor.
            self.stats = [ColumnStats() for _ in self.columns]

        self._scroll_to_offset(self.page_size)
        if self._pages.get(0):
            first_row = self._pages[0][0]
            for i, val in enumerate(first_row):
                self.stats[i].dtype = _infer_dtype(val)
            self.dtypes = [s.dtype for s in self.stats]
            for i, val in enumerate(first_row):
                self.stats[i].update(val)
            for row in self._pages[0][1:]:
                for i, val in enumerate(row):
                    self.stats[i].update(val)
        else:
            if not self.dtypes:
                self.dtypes = ['string' for _ in self.columns]

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
            'sort': list(self.sort) if self.sort else None,
            'filters': [
                {'column': f.column, 'op': f.op, 'value': f.value}
                for f in self.filters
            ],
        }

    # ── Sort / filter / top-N overlays ──────────────────────────────────
    def _quote_ident(self, name: str) -> str:
        """Dialect-aware identifier quoting (relies on SQLAlchemy's preparer
        so we get the right delimiters per backend — backticks for MySQL,
        brackets for SQL Server, double quotes for everything else)."""
        if self._engine is None:
            return f'"{name}"'
        try:
            return self._engine.dialect.identifier_preparer.quote(name)
        except Exception:
            return f'"{name}"'

    def _bind_param_style(self) -> str:
        """Choose a paramstyle compatible with exec_driver_sql for this
        dialect. exec_driver_sql passes through to the DBAPI directly so we
        need the DBAPI's native paramstyle."""
        if self._engine is None:
            return '?'
        try:
            ps = self._engine.dialect.paramstyle
        except Exception:
            ps = 'qmark'
        if ps == 'qmark':
            return '?'
        if ps == 'format':
            return '%s'
        if ps == 'numeric':
            return ':1'
        if ps == 'named':
            return ':p0'
        if ps == 'pyformat':
            return '%(p0)s'
        return '?'

    def _effective_sql(self) -> str:
        """Wrap the user SQL with the active sort/filter overlays, if any."""
        if not self.sort and not self.filters:
            return self.sql
        # Use a CTE so the user SQL doesn't need to be reparsed and any
        # ORDER BY / LIMIT inside it is preserved within the inner scope.
        out = f"WITH user_q AS ({self.sql}) SELECT * FROM user_q"
        where_parts: List[str] = []
        for f in self.filters:
            qcol = self._quote_ident(f.column)
            if f.op == 'contains':
                # Inline a lightly-escaped literal — exec_driver_sql doesn't
                # bind params consistently across drivers and this code path
                # is operator-typed text only.
                safe = str(f.value).replace("'", "''")
                where_parts.append(f"CAST({qcol} AS VARCHAR(4000)) LIKE '%{safe}%'")
            elif f.op == 'equals':
                safe = str(f.value).replace("'", "''")
                if isinstance(f.value, (int, float)):
                    where_parts.append(f"{qcol} = {f.value}")
                else:
                    where_parts.append(f"{qcol} = '{safe}'")
            elif f.op == 'gt' and isinstance(f.value, (int, float)):
                where_parts.append(f"{qcol} > {f.value}")
            elif f.op == 'lt' and isinstance(f.value, (int, float)):
                where_parts.append(f"{qcol} < {f.value}")
            elif (
                f.op == 'between'
                and isinstance(f.value, (list, tuple))
                and len(f.value) == 2
            ):
                lo, hi = f.value
                if isinstance(lo, (int, float)) and isinstance(hi, (int, float)):
                    where_parts.append(f"{qcol} BETWEEN {lo} AND {hi}")
        if where_parts:
            out += ' WHERE ' + ' AND '.join(where_parts)
        if self.sort:
            col, direction = self.sort
            qcol = self._quote_ident(col)
            d = direction.upper()
            if d not in ('ASC', 'DESC'):
                d = 'ASC'
            out += f' ORDER BY {qcol} {d}'
        return out

    def apply_sort(self, column: Optional[str], direction: str = 'ASC') -> None:
        """Set or clear the sort overlay and reopen the cursor."""
        with self._lock:
            if column is None or column == '':
                self.sort = None
            else:
                if column not in self.columns:
                    raise ValueError(f"unknown column {column!r}")
                d = direction.upper()
                if d not in ('ASC', 'DESC'):
                    d = 'ASC'
                self.sort = (column, d)
            self._close_cursor_locked()
            self._open_cursor(self._effective_sql())

    def apply_filters(self, filters: List[Dict[str, Any]]) -> None:
        """Replace the active filter set and reopen the cursor."""
        parsed: List[FilterSpec] = []
        for f in filters or []:
            col = f.get('column')
            op = f.get('op')
            val = f.get('value')
            if not col or not op:
                continue
            if col not in self.columns:
                raise ValueError(f"unknown column {col!r}")
            parsed.append(FilterSpec(column=col, op=op, value=val))
        with self._lock:
            self.filters = parsed
            self._close_cursor_locked()
            self._open_cursor(self._effective_sql())

    def chart_data(self, spec: Dict[str, Any]) -> Dict[str, Any]:
        """Run a server-side aggregation for chart specs of the shape
        {x: col, y: col, color?: col, aggregate: 'sum'|'avg'|'count'|'min'|'max'}.

        Returns {rows: [{x, y, color?}, ...]} pre-aggregated so the browser
        doesn't have to ship the full result set just to render a bar chart.
        For aggregate='count', the y field is COUNT(*) and ignores any y_col.
        """
        x_col = spec.get('x')
        y_col = spec.get('y')
        color_col = spec.get('color')
        agg = (spec.get('aggregate') or 'count').lower()
        if agg not in ('sum', 'avg', 'count', 'min', 'max'):
            raise ValueError(f"unknown aggregate {agg!r}")
        if not x_col or x_col not in self.columns:
            raise ValueError(f"x column missing or unknown: {x_col!r}")
        if agg != 'count' and (not y_col or y_col not in self.columns):
            raise ValueError(f"y column missing or unknown: {y_col!r}")
        if color_col and color_col not in self.columns:
            raise ValueError(f"color column unknown: {color_col!r}")
        if self._engine is None:
            return {'rows': []}

        qx = self._quote_ident(x_col)
        select_parts: List[str] = [f"{qx} AS x"]
        group_parts: List[str] = ['x']
        if color_col:
            qc = self._quote_ident(color_col)
            select_parts.append(f"{qc} AS color")
            group_parts.append('color')
        if agg == 'count':
            select_parts.append('COUNT(*) AS y')
        else:
            qy = self._quote_ident(y_col)
            agg_fn = {'sum': 'SUM', 'avg': 'AVG', 'min': 'MIN', 'max': 'MAX'}[agg]
            select_parts.append(f"{agg_fn}({qy}) AS y")
        sql = (
            f"SELECT {', '.join(select_parts)} "
            f"FROM ({self.sql}) user_q "
            f"GROUP BY {', '.join(group_parts)} "
            f"ORDER BY x "
            f"LIMIT 5000"
        )
        rows: List[Dict[str, Any]] = []
        with self._engine.connect() as conn:
            result = conn.exec_driver_sql(sql)
            keys = list(result.keys())
            for r in result.fetchall():
                serial = list(make_row_serializable(r))
                obj: Dict[str, Any] = {}
                for k, v in zip(keys, serial):
                    obj[k] = v
                rows.append(obj)
        return {'rows': rows, 'x_column': x_col, 'y_column': y_col, 'color_column': color_col, 'aggregate': agg}

    def top_n_values(self, column: str, n: int = 10) -> List[Dict[str, Any]]:
        """Independent aggregation query — doesn't touch the cursor."""
        if column not in self.columns:
            raise ValueError(f"unknown column {column!r}")
        if self._engine is None:
            return []
        qcol = self._quote_ident(column)
        n = max(1, min(int(n), 100))
        sql = (
            f"SELECT {qcol} AS v, COUNT(*) AS c "
            f"FROM ({self.sql}) user_q "
            f"GROUP BY {qcol} "
            f"ORDER BY c DESC, v ASC "
            f"LIMIT {n}"
        )
        with self._engine.connect() as conn:
            result = conn.exec_driver_sql(sql)
            rows = result.fetchall()
        out: List[Dict[str, Any]] = []
        for r in rows:
            v, c = r[0], r[1]
            v_ser = list(make_row_serializable((v,)))[0]
            out.append({'value': v_ser, 'count': int(c)})
        return out


# ─── Module-level helper used by the task layer ────────────────────────────
def open_session(dbid: str, sql: str, usedb: Optional[str] = None) -> ResultSession:
    """Open a streaming ResultSession against `dbid` for `sql`."""
    sess = ResultSession(dbid, sql, usedb=usedb)
    sess.open()
    return sess
