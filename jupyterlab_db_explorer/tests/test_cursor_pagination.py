"""Test the streaming ResultSession + task store pagination."""
from __future__ import annotations

import asyncio
import json
import os
import time

import pytest

from .. import task as task_mod
from ..result_session import (
    ColumnStats,
    ResultSession,
    _infer_dtype,
    open_session,
)


# ─── Test fixtures ──────────────────────────────────────────────────────────
@pytest.fixture
def sqlite_conn(tmp_path):
    """Register an in-memory SQLite connection in the engine's DB config."""
    from .. import engine

    db_file = tmp_path / "cursor_test.db"
    # Seed the SQLite file with 250 rows of mixed types using sqlalchemy directly.
    import sqlalchemy as sa
    eng = sa.create_engine(f"sqlite+pysqlite:///{db_file}")
    with eng.begin() as conn:
        conn.exec_driver_sql(
            "CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT, value REAL)"
        )
        rows = [(i, f"name-{i % 7}", float(i) * 1.5) for i in range(1, 251)]
        conn.exec_driver_sql(
            "INSERT INTO t (id, name, value) VALUES (?, ?, ?)", rows
        )
    eng.dispose()

    # Add it to the live DB config so engine.getEngine() can resolve it.
    dbinfo = {
        'db_id': 'cursor_test',
        'db_type': engine.DB_SQLITE,
        'db_name': str(db_file),
    }
    engine.addEntry(dbinfo)
    yield 'cursor_test'
    # Cleanup: remove from config
    engine.delEntry('cursor_test')


# ─── Unit tests for the helpers ─────────────────────────────────────────────
def test_infer_dtype_basics():
    assert _infer_dtype(1) == 'number'
    assert _infer_dtype(1.5) == 'number'
    assert _infer_dtype('abc') == 'string'
    assert _infer_dtype(True) == 'string'  # bool deliberately not 'number'
    import datetime
    assert _infer_dtype(datetime.datetime.now()) == 'datetime'
    assert _infer_dtype(datetime.date.today()) == 'datetime'
    assert _infer_dtype(None) == 'string'


def test_column_stats_numeric():
    s = ColumnStats(dtype='number')
    for v in [1, 2, 3, 4, 5, None, 3]:
        s.update(v)
    snap = s.snapshot()
    assert snap['count'] == 6
    assert snap['null_count'] == 1
    assert snap['min'] == 1.0
    assert snap['max'] == 5.0
    assert snap['mean'] == pytest.approx((1 + 2 + 3 + 4 + 5 + 3) / 6)
    assert snap['distinct'] == 5  # unique values: 1,2,3,4,5


def test_column_stats_string_distinct_cap():
    s = ColumnStats(dtype='string')
    for i in range(1100):
        s.update(f'v{i}')
    snap = s.snapshot()
    # Once over the 1000 cap, distinct should switch to the '1000+' marker.
    assert snap['distinct'] == '1000+'
    assert snap['count'] == 1100


# ─── ResultSession integration ──────────────────────────────────────────────
def test_session_open_metadata_and_first_page(sqlite_conn):
    sess = open_session(sqlite_conn, "SELECT id, name, value FROM t ORDER BY id")
    try:
        assert sess.columns == ['id', 'name', 'value']
        assert sess.dtypes == ['number', 'string', 'number']
        # First-page priming put 250 rows into the cache (page_size default 1000).
        first_page = sess.fetch_page(0, sess.page_size)
        assert len(first_page) == 250
        assert first_page[0] == [1, 'name-1', 1.5]
        assert sess.cursor_exhausted is True
        assert sess.total_rows == 250
    finally:
        sess.close()


def test_session_paginated_fetch(sqlite_conn):
    # Force a small page size so we exercise multiple cursor batches.
    os.environ['DB_EXPLORER_RESULT_PAGE_SIZE'] = '40'
    try:
        sess = open_session(sqlite_conn, "SELECT id FROM t ORDER BY id")
        try:
            assert sess.page_size == 40
            # Out-of-order page fetches must work because we cache.
            p2 = sess.fetch_page(80, 40)
            assert [r[0] for r in p2] == list(range(81, 121))
            p0 = sess.fetch_page(0, 40)
            assert [r[0] for r in p0] == list(range(1, 41))
            # Beyond the result: empty list, not error.
            tail = sess.fetch_page(300, 50)
            assert tail == []
            # After full scroll, total_rows is known.
            assert sess.total_rows == 250
        finally:
            sess.close()
    finally:
        os.environ.pop('DB_EXPLORER_RESULT_PAGE_SIZE', None)


def test_session_hard_cap_stops_cursor(sqlite_conn):
    os.environ['DB_EXPLORER_QUERY_LIMIT'] = '100'
    os.environ['DB_EXPLORER_RESULT_PAGE_SIZE'] = '50'
    try:
        sess = open_session(sqlite_conn, "SELECT id FROM t ORDER BY id")
        try:
            # Scroll forward — the session should stop at the cap.
            page = sess.fetch_page(0, 200)
            assert len(page) == 100
            assert sess.cursor_exhausted is True
            assert sess.total_rows == 100
        finally:
            sess.close()
    finally:
        os.environ.pop('DB_EXPLORER_QUERY_LIMIT', None)
        os.environ.pop('DB_EXPLORER_RESULT_PAGE_SIZE', None)


# ─── Task store integration ─────────────────────────────────────────────────
async def test_task_store_round_trip(sqlite_conn):
    # Open via the task layer so we cover the asyncio path too.
    taskid = await task_mod.create_query_task(
        sqlite_conn, "SELECT id, name, value FROM t ORDER BY id"
    )
    rc, payload = await task_mod.get_result(taskid)
    assert rc is True
    assert payload['columns'] == ['id', 'name', 'value']
    assert payload['dtypes'] == ['number', 'string', 'number']
    assert payload['total_rows'] == 250
    assert payload['cursor_exhausted'] is True
    assert len(payload['data']) == 250  # first-page came back

    # get_page returns a slice
    ok, page = task_mod.get_page(taskid, 100, 25)
    assert ok is True
    assert len(page['data']) == 25
    assert page['data'][0][0] == 101

    # stats endpoint
    ok, stats = task_mod.get_stats(taskid)
    assert ok is True
    snap = stats['stats']
    assert snap[0]['dtype'] == 'number'  # id
    assert snap[1]['dtype'] == 'string'  # name
    assert snap[2]['dtype'] == 'number'  # value
    assert snap[0]['count'] == 250

    # delete should close the session cleanly.
    deleted = await task_mod.delete(taskid)
    assert deleted is True
    ok, payload = task_mod.get_page(taskid, 0, 10)
    assert ok is False


async def test_task_store_ttl_eviction(sqlite_conn, monkeypatch):
    # Make TTL effectively zero so the very next eviction sweep drops the entry.
    monkeypatch.setenv('DB_EXPLORER_RESULT_TTL_SEC', '1')
    taskid = await task_mod.create_query_task(
        sqlite_conn, "SELECT id FROM t LIMIT 5"
    )
    rc, _ = await task_mod.get_result(taskid)
    assert rc is True

    # Backdate last_access so the TTL sweep evicts it.
    entry = task_mod.task_dict[taskid]
    entry.last_access = time.time() - 3600

    # Trigger eviction via any task-store call (e.g. another create).
    task_mod._evict_expired()
    assert taskid not in task_mod.task_dict
